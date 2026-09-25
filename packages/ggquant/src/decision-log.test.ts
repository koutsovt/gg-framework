import { describe, it, expect } from "vitest";
import {
  InMemoryStore,
  emitSetupCompiled,
  emitParameterChosen,
  emitHarnessVerdict,
} from "./decision-log.js";
import { compileSetup } from "./definition-layer.js";
import { runHarness } from "./harness.js";
import { Rng } from "./rng.js";
import type { Bar } from "./detector-types.js";
import type { Setup } from "./types.js";
import type { CostModel } from "./simulator-types.js";
import type { HarnessConfig } from "./harness-types.js";

// ── Helpers ──────────────────────────────────────────────────────────

const COST: CostModel = {
  spreadPoints: 0.5,
  slippagePoints: 0.3,
  commissionPerTrade: 1.0,
};

const FAST_CONFIG: HarnessConfig = {
  folds: 3,
  baselineIterations: 20,
  monteCarloIterations: 100,
  sweepSteps: 5,
  seed: 42,
};

function validFvgSetup(): Setup {
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
  };
}

function generateBars(count: number, seed: number): Bar[] {
  const rng = new Rng(seed);
  const bars: Bar[] = [];
  let price = 100;

  for (let i = 0; i < count; i++) {
    const drift = (rng.next() - 0.45) * 3;
    const vol = 1 + rng.next() * 4;
    const open = price;
    const close = open + drift;
    const high = Math.max(open, close) + rng.next() * vol;
    const low = Math.min(open, close) - rng.next() * vol;

    bars.push({
      o: Math.round(open * 100) / 100,
      h: Math.round(high * 100) / 100,
      l: Math.round(low * 100) / 100,
      c: Math.round(close * 100) / 100,
    });

    if (i % 15 === 14 && rng.next() > 0.3) {
      price = close + (rng.next() > 0.3 ? 1 : -1) * (3 + rng.next() * 5);
    } else {
      price = close;
    }
  }

  return bars;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Decision Log", () => {
  const setup = validFvgSetup();
  const bars = generateBars(500, 123);

  it("emits a setup-compiled record when a setup compiles", () => {
    const store = new InMemoryStore();
    const result = compileSetup(setup);
    const record = emitSetupCompiled(result, store);

    expect(record).not.toBeNull();
    expect(record!.kind).toBe("setup-compiled");
    expect(record!.subject).toBe("Bullish FVG London@1.0.0");
    expect(record!.rationale).toBe(setup.metadata.thesis);
    expect(record!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect((record!.payload as Record<string, unknown>)["detector"]).toBe("fvg");
    expect(store.list().length).toBe(1);
  });

  it("returns null for a rejected setup", () => {
    const store = new InMemoryStore();
    const badSetup: Setup = {
      ...setup,
      detection: { detector: "fvg", params: {} },
    };
    const result = compileSetup(badSetup);
    const record = emitSetupCompiled(result, store);

    expect(record).toBeNull();
    expect(store.list().length).toBe(0);
  });

  it("emits parameter-chosen records with rationale", () => {
    const store = new InMemoryStore();

    emitParameterChosen(
      setup,
      "min_size_atr",
      0.5,
      "0.5 ATR is the minimum gap size that corresponds to institutional delivery per ICT framework.",
      store,
    );

    emitParameterChosen(
      setup,
      "atr_period",
      3,
      "3-bar ATR matches the FVG formation window length.",
      store,
    );

    const records = store.list();
    expect(records.length).toBe(2);

    expect(records[0]!.kind).toBe("parameter-chosen");
    expect((records[0]!.payload as Record<string, unknown>)["paramName"]).toBe("min_size_atr");
    expect((records[0]!.payload as Record<string, unknown>)["paramValue"]).toBe(0.5);
    expect(records[0]!.rationale).toContain("institutional delivery");

    expect(records[1]!.kind).toBe("parameter-chosen");
    expect((records[1]!.payload as Record<string, unknown>)["paramName"]).toBe("atr_period");
  });

  it("emits a harness-verdict record after the full pipeline", () => {
    const store = new InMemoryStore();
    const result = compileSetup(setup);
    if (result._tag !== "CompiledSetup") throw new Error("Should compile");

    const verdict = runHarness(result, bars, COST, FAST_CONFIG);
    const record = emitHarnessVerdict(result, verdict, store);

    expect(record.kind).toBe("harness-verdict");
    expect(record.subject).toBe("Bullish FVG London@1.0.0");
    expect((record.payload as Record<string, unknown>)["recommendation"]).toBe(
      verdict.recommendation,
    );

    const holdoutPayload = (record.payload as Record<string, unknown>)["holdout"] as Record<
      string,
      unknown
    >;
    expect(typeof holdoutPayload["pass"]).toBe("boolean");
    expect(typeof holdoutPayload["avgOosWinRate"]).toBe("number");
  });

  it("full pipeline: parameter choices timestamped before harness verdict", () => {
    const store = new InMemoryStore();

    // Step 1: Compile
    const result = compileSetup(setup);
    emitSetupCompiled(result, store);

    // Step 2: Document parameter choices BEFORE backtesting
    emitParameterChosen(
      setup,
      "min_size_atr",
      0.5,
      "0.5 ATR corresponds to institutional delivery gaps.",
      store,
    );
    emitParameterChosen(setup, "atr_period", 3, "3-bar ATR matches FVG formation window.", store);

    // Step 3: Run harness (the backtest)
    if (result._tag !== "CompiledSetup") throw new Error("Should compile");
    const verdict = runHarness(result, bars, COST, FAST_CONFIG);
    emitHarnessVerdict(result, verdict, store);

    // Verify ordering: all three kinds present, parameter choices before verdict
    const records = store.list();
    expect(records.length).toBe(4);
    expect(records[0]!.kind).toBe("setup-compiled");
    expect(records[1]!.kind).toBe("parameter-chosen");
    expect(records[2]!.kind).toBe("parameter-chosen");
    expect(records[3]!.kind).toBe("harness-verdict");

    // Timestamps: parameter choices before verdict
    const paramTs = new Date(records[1]!.timestamp).getTime();
    const verdictTs = new Date(records[3]!.timestamp).getTime();
    expect(paramTs).toBeLessThanOrEqual(verdictTs);
  });

  it("all records have valid ISO-8601 timestamps", () => {
    const store = new InMemoryStore();
    const result = compileSetup(setup);
    emitSetupCompiled(result, store);
    if (result._tag !== "CompiledSetup") throw new Error("Should compile");

    emitParameterChosen(setup, "min_size_atr", 0.5, "test", store);
    const verdict = runHarness(result, bars, COST, FAST_CONFIG);
    emitHarnessVerdict(result, verdict, store);

    for (const record of store.list()) {
      expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(record.timestamp).getTime()).not.toBeNaN();
    }
  });
});
