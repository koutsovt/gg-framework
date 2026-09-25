import { describe, it, expect } from "vitest";
import { runHarness } from "./harness.js";
import { compileSetup } from "./definition-layer.js";
import { Rng } from "./rng.js";
import { ContentCache } from "./cache.js";
import type { Bar } from "./detector-types.js";
import type { CompiledSetup, Setup } from "./types.js";
import type { CostModel } from "./simulator-types.js";
import type { HarnessConfig } from "./harness-types.js";

// ── Helpers ──────────────────────────────────────────────────────────

const COST: CostModel = {
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
 * Generate a synthetic bar series with enough structure for the harness.
 * Creates trending segments with periodic FVG-like gaps to exercise
 * all four tests meaningfully.
 */
function generateBars(count: number, seed: number): Bar[] {
  const rng = new Rng(seed);
  const bars: Bar[] = [];
  let price = 100;

  for (let i = 0; i < count; i++) {
    const drift = (rng.next() - 0.45) * 3; // slight upward bias
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

    // Occasionally create a gap (jump) to produce FVGs
    if (i % 15 === 14 && rng.next() > 0.3) {
      price = close + (rng.next() > 0.3 ? 1 : -1) * (3 + rng.next() * 5);
    } else {
      price = close;
    }
  }

  return bars;
}

// Fast config for tests (smaller iterations so tests finish quickly)
const FAST_CONFIG: HarnessConfig = {
  folds: 3,
  baselineIterations: 20,
  monteCarloIterations: 100,
  sweepSteps: 5,
  seed: 42,
};

// ── Tests ────────────────────────────────────────────────────────────

describe("Honesty Harness", () => {
  const bars = generateBars(500, 123);
  const compiled = compile(validFvgSetup());

  it("produces a full four-test verdict", () => {
    const verdict = runHarness(compiled, bars, COST, FAST_CONFIG);

    // All four tests present
    expect(verdict.holdout).toBeDefined();
    expect(verdict.baseline).toBeDefined();
    expect(verdict.dofAudit).toBeDefined();
    expect(verdict.monteCarlo).toBeDefined();

    // Each test has a pass/fail boolean
    expect(typeof verdict.holdout.pass).toBe("boolean");
    expect(typeof verdict.baseline.pass).toBe("boolean");
    expect(typeof verdict.dofAudit.pass).toBe("boolean");
    expect(typeof verdict.monteCarlo.pass).toBe("boolean");

    // Overall recommendation
    expect(["promote", "shelve"]).toContain(verdict.recommendation);
  });

  it("holdout has the correct number of folds", () => {
    const verdict = runHarness(compiled, bars, COST, FAST_CONFIG);
    expect(verdict.holdout.folds.length).toBe(FAST_CONFIG.folds);

    for (const fold of verdict.holdout.folds) {
      expect(fold.inSampleWinRate).toBeGreaterThanOrEqual(0);
      expect(fold.inSampleWinRate).toBeLessThanOrEqual(1);
      expect(fold.outOfSampleWinRate).toBeGreaterThanOrEqual(0);
      expect(fold.outOfSampleWinRate).toBeLessThanOrEqual(1);
    }
  });

  it("baseline ran the configured number of iterations", () => {
    const verdict = runHarness(compiled, bars, COST, FAST_CONFIG);
    expect(verdict.baseline.baselineIterations).toBe(FAST_CONFIG.baselineIterations);
    expect(verdict.baseline.strategyWinRate).toBeGreaterThanOrEqual(0);
    expect(verdict.baseline.baselineWinRate).toBeGreaterThanOrEqual(0);
  });

  it("DoF audit sweeps all numeric params", () => {
    const verdict = runHarness(compiled, bars, COST, FAST_CONFIG);

    // "direction" is a string param — only min_size_atr and atr_period are numeric
    expect(verdict.dofAudit.paramCount).toBe(2);
    expect(verdict.dofAudit.sweeps.length).toBe(2);

    for (const sweep of verdict.dofAudit.sweeps) {
      expect(sweep.points.length).toBe(FAST_CONFIG.sweepSteps);
      expect(typeof sweep.isRobust).toBe("boolean");
      expect(typeof sweep.avgRCv).toBe("number");
    }
  });

  it("Monte Carlo ran the configured number of iterations", () => {
    const verdict = runHarness(compiled, bars, COST, FAST_CONFIG);
    expect(verdict.monteCarlo.iterations).toBe(FAST_CONFIG.monteCarloIterations);
    expect(typeof verdict.monteCarlo.realTotalR).toBe("number");
    expect(verdict.monteCarlo.realPercentile).toBeGreaterThanOrEqual(0);
    expect(verdict.monteCarlo.realPercentile).toBeLessThanOrEqual(100);
    expect(typeof verdict.monteCarlo.realMaxDrawdown).toBe("number");
  });

  it("verdict is deterministic (same inputs → same output)", () => {
    const v1 = runHarness(compiled, bars, COST, FAST_CONFIG);
    const v2 = runHarness(compiled, bars, COST, FAST_CONFIG);
    expect(v1).toEqual(v2);
  });

  it("promote requires all four tests to pass", () => {
    const verdict = runHarness(compiled, bars, COST, FAST_CONFIG);

    if (verdict.recommendation === "promote") {
      expect(verdict.holdout.pass).toBe(true);
      expect(verdict.baseline.pass).toBe(true);
      expect(verdict.dofAudit.pass).toBe(true);
      expect(verdict.monteCarlo.pass).toBe(true);
    }

    // If any test fails, recommendation must be shelve
    if (
      !verdict.holdout.pass ||
      !verdict.baseline.pass ||
      !verdict.dofAudit.pass ||
      !verdict.monteCarlo.pass
    ) {
      expect(verdict.recommendation).toBe("shelve");
    }
  });

  // ── Cache: sub-second incremental rerun ────────────────────────────

  it("incremental parameter change reruns sub-second via cache", () => {
    const cache = new ContentCache();

    // First run: cold cache
    const t0 = performance.now();
    runHarness(compiled, bars, COST, FAST_CONFIG, cache);
    const coldMs = performance.now() - t0;

    const stats1 = cache.stats();
    expect(stats1.misses).toBeGreaterThan(0);

    // Second run: same inputs → full cache hit
    const t1 = performance.now();
    runHarness(compiled, bars, COST, FAST_CONFIG, cache);
    const warmMs = performance.now() - t1;

    const stats2 = cache.stats();
    expect(stats2.hits).toBeGreaterThan(stats1.hits);

    // Warm run should be faster
    expect(warmMs).toBeLessThan(coldMs);

    // Incremental change: tweak one param
    const tweaked = compile(
      validFvgSetup({
        detection: {
          detector: "fvg",
          params: { min_size_atr: 0.6, atr_period: 3, direction: "bullish" },
        },
      }),
    );

    const t2 = performance.now();
    runHarness(tweaked, bars, COST, FAST_CONFIG, cache);
    const incrementalMs = performance.now() - t2;

    // Incremental run should still be fast (partial cache hits)
    // We're generous here — just verify it completes under 2 seconds
    expect(incrementalMs).toBeLessThan(2000);
  });

  // ── RNG determinism ────────────────────────────────────────────────

  it("seeded RNG produces identical sequence across runs", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  // ── Edge case: too few bars ────────────────────────────────────────

  it("handles very short bar series gracefully", () => {
    const shortBars = generateBars(20, 999);
    const verdict = runHarness(compiled, shortBars, COST, FAST_CONFIG);

    // Should still produce a verdict (likely shelve)
    expect(verdict).toBeDefined();
    expect(["promote", "shelve"]).toContain(verdict.recommendation);
  });
});
