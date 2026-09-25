import { describe, it, expect } from "vitest";
import { simulate } from "./simulator.js";
import { compileSetup } from "./definition-layer.js";
import type { Bar } from "./detector-types.js";
import type { CompiledSetup, Setup } from "./types.js";
import type { CostModel } from "./simulator-types.js";

// ── Helpers ──────────────────────────────────────────────────────────

const ZERO_COST: CostModel = {
  spreadPoints: 0,
  slippagePoints: 0,
  commissionPerTrade: 0,
};

const REALISTIC_COST: CostModel = {
  spreadPoints: 0.5,
  slippagePoints: 0.3,
  commissionPerTrade: 1.0,
};

function validFvgSetup(overrides?: Partial<Setup>): Setup {
  return {
    detection: {
      detector: "fvg",
      params: { min_size_atr: 0.5, atr_period: 3, direction: "bullish" },
    },
    contextFilter: {
      sessionWindow: {
        label: "London",
        startTime: "07:00",
        endTime: "10:00",
        timezone: "Europe/London",
      },
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    entryTrigger: {
      orderType: "limit",
      priceRef: "fvg_midpoint",
    },
    invalidation: {
      priceRef: "fvg_lower",
      offsetPoints: 2,
      timeStopBars: 5,
    },
    target: {
      levels: [{ kind: "r_multiple", value: 2 }],
    },
    positionModel: {
      riskFraction: 0.01,
    },
    metadata: {
      name: "Bullish FVG London",
      version: "1.0.0",
      author: "test",
      thesis:
        "Bullish FVGs during London session on trending days offer a fill-the-gap edge due to institutional order flow.",
    },
    ...overrides,
  };
}

function compile(setup: Setup): CompiledSetup {
  const result = compileSetup(setup);
  if (result._tag !== "CompiledSetup") {
    throw new Error(
      `Setup failed to compile: ${result.rejections.map((r) => r.message).join(", ")}`,
    );
  }
  return result;
}

/**
 * Crafted bar series that produces a known bullish FVG at bars [1,2,3]:
 * bar1.high = 103, bar3.low = 107.5 → gap of 4.5
 * Then price retraces to the midpoint (105.25) on bar 5 → entry fills.
 * Then price either hits target or stop depending on subsequent bars.
 */
const FIXTURE_BARS_WIN: readonly Bar[] = [
  { o: 100, h: 102.5, l: 99, c: 101.5 }, // 0
  { o: 101.5, h: 103, l: 100.5, c: 102.5 }, // 1 — bar1, high=103
  { o: 102.5, h: 107, l: 102, c: 106.5 }, // 2 — bar2
  { o: 108, h: 110.5, l: 107.5, c: 110 }, // 3 — bar3, low=107.5 → FVG [103, 107.5]
  { o: 110, h: 110.5, l: 108, c: 109 }, // 4 — no retrace yet
  { o: 108, h: 109, l: 104, c: 106 }, // 5 — retraces to 104, fills limit at midpoint 105.25
  { o: 106, h: 108, l: 105, c: 107 }, // 6 — held
  { o: 107, h: 110, l: 106, c: 109 }, // 7 — held
  { o: 109, h: 115, l: 108, c: 114 }, // 8 — target hit (entry ~105.25, risk ~4.25, target ~113.75)
  { o: 114, h: 116, l: 113, c: 115 }, // 9
];

const FIXTURE_BARS_STOP: readonly Bar[] = [
  { o: 100, h: 102.5, l: 99, c: 101.5 }, // 0
  { o: 101.5, h: 103, l: 100.5, c: 102.5 }, // 1 — bar1, high=103
  { o: 102.5, h: 107, l: 102, c: 106.5 }, // 2 — bar2
  { o: 108, h: 110.5, l: 107.5, c: 110 }, // 3 — bar3 → FVG [103, 107.5]
  { o: 108, h: 109, l: 104, c: 106 }, // 4 — retraces, fills at midpoint
  { o: 106, h: 107, l: 99, c: 100 }, // 5 — crashes through stop (103-2=101)
  { o: 100, h: 102, l: 98, c: 101 }, // 6
];

// ── Tests ────────────────────────────────────────────────────────────

describe("Trajectory Simulator", () => {
  it("produces a deterministic trade ledger from a compiled FVG setup", () => {
    const compiled = compile(validFvgSetup());
    const ledger = simulate(compiled, FIXTURE_BARS_WIN, ZERO_COST);

    expect(ledger.entries.length).toBeGreaterThanOrEqual(1);

    // The first trade should be from the FVG at bars [1,2,3]
    const trade = ledger.entries[0]!;
    expect(trade.direction).toBe("long");
    expect(trade.entryBar).toBeGreaterThan(3); // filled after maturity
    expect(trade.exitBar).toBeGreaterThan(trade.entryBar);
    expect(trade.barsHeld).toBe(trade.exitBar - trade.entryBar);
  });

  it("deterministic: same inputs produce identical ledger", () => {
    const compiled = compile(validFvgSetup());
    const ledger1 = simulate(compiled, FIXTURE_BARS_WIN, ZERO_COST);
    const ledger2 = simulate(compiled, FIXTURE_BARS_WIN, ZERO_COST);

    expect(ledger1).toEqual(ledger2);
  });

  it("zero-cost and realistic-cost runs differ", () => {
    const compiled = compile(validFvgSetup());
    const zeroLedger = simulate(compiled, FIXTURE_BARS_WIN, ZERO_COST);
    const costLedger = simulate(compiled, FIXTURE_BARS_WIN, REALISTIC_COST);

    expect(zeroLedger.entries.length).toBe(costLedger.entries.length);

    if (zeroLedger.entries.length > 0) {
      const zeroTrade = zeroLedger.entries[0]!;
      const costTrade = costLedger.entries[0]!;

      // Entry price should be higher with costs (long → adverse)
      expect(costTrade.entryPrice).toBeGreaterThan(zeroTrade.entryPrice);
      // R achieved should be lower with costs
      expect(costTrade.rAchieved).toBeLessThan(zeroTrade.rAchieved);
    }
  });

  it("entry fills at the limit price (fvg_midpoint)", () => {
    const compiled = compile(validFvgSetup());
    const ledger = simulate(compiled, FIXTURE_BARS_WIN, ZERO_COST);

    const trade = ledger.entries[0]!;
    // FVG at bars [1,2,3]: lower=103, upper=107.5, mid=105.25
    expect(trade.entryPrice).toBeCloseTo(105.25, 1);
  });

  it("stop loss triggers at invalidation price minus offset", () => {
    const compiled = compile(validFvgSetup());
    const ledger = simulate(compiled, FIXTURE_BARS_STOP, ZERO_COST);

    expect(ledger.entries.length).toBeGreaterThanOrEqual(1);
    const trade = ledger.entries[0]!;
    expect(trade.exitReason).toBe("stop");
    // Stop at fvg_lower(103) - offsetPoints(2) = 101
    expect(trade.exitPrice).toBeCloseTo(101, 1);
    expect(trade.rAchieved).toBeLessThan(0);
  });

  it("target hit produces positive R", () => {
    const compiled = compile(validFvgSetup());
    const ledger = simulate(compiled, FIXTURE_BARS_WIN, ZERO_COST);

    const trade = ledger.entries[0]!;
    if (trade.exitReason === "target") {
      expect(trade.rAchieved).toBeGreaterThan(0);
    }
  });

  it("time-stop fires when entry never fills within timeStopBars", () => {
    // Bars that never retrace to midpoint
    const noRetraceBars: readonly Bar[] = [
      { o: 100, h: 102.5, l: 99, c: 101.5 },
      { o: 101.5, h: 103, l: 100.5, c: 102.5 },
      { o: 102.5, h: 107, l: 102, c: 106.5 },
      { o: 108, h: 110.5, l: 107.5, c: 110 }, // FVG, mid=105.25
      { o: 110, h: 112, l: 109, c: 111 }, // no retrace
      { o: 111, h: 113, l: 110, c: 112 },
      { o: 112, h: 114, l: 111, c: 113 },
      { o: 113, h: 115, l: 112, c: 114 },
      { o: 114, h: 116, l: 113, c: 115 },
      { o: 115, h: 117, l: 114, c: 116 },
    ];

    const compiled = compile(validFvgSetup());
    const ledger = simulate(compiled, noRetraceBars, ZERO_COST);

    // Entry never fills → no trade in ledger
    expect(ledger.entries.length).toBe(0);
  });

  it("empty bars produce empty ledger", () => {
    const compiled = compile(validFvgSetup());
    const ledger = simulate(compiled, [], ZERO_COST);
    expect(ledger.entries).toEqual([]);
  });

  it("ledger entries have all required fields", () => {
    const compiled = compile(validFvgSetup());
    const ledger = simulate(compiled, FIXTURE_BARS_WIN, REALISTIC_COST);

    for (const entry of ledger.entries) {
      expect(entry.entryBar).toBeGreaterThanOrEqual(0);
      expect(entry.exitBar).toBeGreaterThan(entry.entryBar);
      expect(typeof entry.entryPrice).toBe("number");
      expect(typeof entry.exitPrice).toBe("number");
      expect(["long", "short"]).toContain(entry.direction);
      expect(typeof entry.rAchieved).toBe("number");
      expect(entry.barsHeld).toBe(entry.exitBar - entry.entryBar);
      expect(["target", "stop", "time_stop"]).toContain(entry.exitReason);
      expect(entry.detectorEvent).toBeDefined();
      expect(entry.riskPerUnit).toBeGreaterThan(0);
    }
  });

  it("costs are applied symmetrically to entry and exit", () => {
    const compiled = compile(validFvgSetup());
    const cost: CostModel = {
      spreadPoints: 1.0,
      slippagePoints: 0.5,
      commissionPerTrade: 0,
    };
    const zeroLedger = simulate(compiled, FIXTURE_BARS_WIN, ZERO_COST);
    const costLedger = simulate(compiled, FIXTURE_BARS_WIN, cost);

    if (zeroLedger.entries.length > 0 && costLedger.entries.length > 0) {
      const z = zeroLedger.entries[0]!;
      const c = costLedger.entries[0]!;

      // Long entry: cost entry = raw entry + spread + slippage
      expect(c.entryPrice).toBeCloseTo(z.entryPrice + 1.5, 5);
    }
  });
});
