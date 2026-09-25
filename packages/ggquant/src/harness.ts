// ──────────────────────────────────────────────────────────────────────
// ggquant — Honesty Harness (Stage 04)
// SPEC.md §5: four-test verdict. A setup earns "has edge" only if it
// clears ALL four tests. Most will not. That is the instrument working.
//
// Build order: correct single-threaded first.
// Speed from caching and parallelism, never from doing less validation.
// ──────────────────────────────────────────────────────────────────────

import type { Bar } from "./detector-types.js";
import type { CompiledSetup, Setup } from "./types.js";
import type { CostModel, LedgerEntry } from "./simulator-types.js";
import type {
  HarnessVerdict,
  HarnessConfig,
  HoldoutResult,
  BaselineResult,
  DofAuditResult,
  MonteCarloResult,
  FoldResult,
  ParamSweepResult,
  SweepPoint,
} from "./harness-types.js";
import { DEFAULT_HARNESS_CONFIG } from "./harness-types.js";
import { simulate } from "./simulator.js";
import { compileSetup } from "./definition-layer.js";
import { Rng } from "./rng.js";
import { ContentCache } from "./cache.js";

// ── Shared helpers ───────────────────────────────────────────────────

function winRate(entries: readonly LedgerEntry[]): number {
  if (entries.length === 0) return 0;
  return entries.filter((e) => e.rAchieved > 0).length / entries.length;
}

function avgR(entries: readonly LedgerEntry[]): number {
  if (entries.length === 0) return 0;
  return entries.reduce((sum, e) => sum + e.rAchieved, 0) / entries.length;
}

function totalR(entries: readonly LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.rAchieved, 0);
}

function maxDrawdown(rValues: readonly number[]): number {
  let peak = 0;
  let equity = 0;
  let maxDd = 0;
  for (const r of rValues) {
    equity += r;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

// ── Test 1: Out-of-sample holdout (walk-forward) ─────────────────────

function runHoldout(
  compiled: CompiledSetup,
  bars: readonly Bar[],
  cost: CostModel,
  config: HarnessConfig,
  cache: ContentCache,
): HoldoutResult {
  const nFolds = config.folds;
  const foldSize = Math.floor(bars.length / (nFolds + 1));
  if (foldSize < 10) {
    return {
      pass: false,
      folds: [],
      avgOosWinRate: 0,
      avgOosAvgR: 0,
    };
  }

  const folds: FoldResult[] = [];

  for (let f = 0; f < nFolds; f++) {
    const trainEnd = foldSize * (f + 1);
    const testEnd = Math.min(trainEnd + foldSize, bars.length);

    const trainBars = bars.slice(0, trainEnd);
    const testBars = bars.slice(0, testEnd);

    const trainLedger = cache.getOrCompute(
      ["simulate", compiled.setup, trainBars.length, cost],
      () => simulate(compiled, trainBars, cost),
    );

    const fullLedger = cache.getOrCompute(["simulate", compiled.setup, testBars.length, cost], () =>
      simulate(compiled, testBars, cost),
    );

    // OOS trades: entries that occur in the test region only
    const oosEntries = fullLedger.entries.filter((e) => e.entryBar >= trainEnd);

    folds.push({
      foldIndex: f,
      inSampleTrades: trainLedger.entries.length,
      outOfSampleTrades: oosEntries.length,
      inSampleWinRate: winRate(trainLedger.entries),
      outOfSampleWinRate: winRate(oosEntries),
      inSampleAvgR: avgR(trainLedger.entries),
      outOfSampleAvgR: avgR(oosEntries),
    });
  }

  const oosWinRates = folds.map((f) => f.outOfSampleWinRate);
  const oosAvgRs = folds.map((f) => f.outOfSampleAvgR);
  const meanOosWr =
    oosWinRates.length > 0 ? oosWinRates.reduce((a, b) => a + b, 0) / oosWinRates.length : 0;
  const meanOosR = oosAvgRs.length > 0 ? oosAvgRs.reduce((a, b) => a + b, 0) / oosAvgRs.length : 0;

  // Pass if average OOS performance is positive
  const pass = meanOosR > 0 && meanOosWr > 0.45;

  return {
    pass,
    folds,
    avgOosWinRate: meanOosWr,
    avgOosAvgR: meanOosR,
  };
}

// ── Test 2: Baseline comparison ──────────────────────────────────────

function runBaseline(
  compiled: CompiledSetup,
  bars: readonly Bar[],
  cost: CostModel,
  config: HarnessConfig,
  cache: ContentCache,
): BaselineResult {
  // Run strategy
  const stratLedger = cache.getOrCompute(["simulate", compiled.setup, bars.length, cost], () =>
    simulate(compiled, bars, cost),
  );

  const stratWr = winRate(stratLedger.entries);
  const stratAvg = avgR(stratLedger.entries);

  if (stratLedger.entries.length === 0) {
    return {
      pass: false,
      strategyWinRate: 0,
      baselineWinRate: 0,
      strategyAvgR: 0,
      baselineAvgR: 0,
      baselineIterations: config.baselineIterations,
    };
  }

  // Compute average hold time and trade count from strategy
  const avgHold =
    stratLedger.entries.reduce((s, e) => s + e.barsHeld, 0) / stratLedger.entries.length;
  const tradeCount = stratLedger.entries.length;
  const targetR = compiled.setup.target.levels[0];
  const rTarget = targetR && targetR.kind === "r_multiple" ? targetR.value : 2;

  // Run random baselines
  const rng = new Rng(config.seed);
  let baseWrSum = 0;
  let baseRSum = 0;

  for (let iter = 0; iter < config.baselineIterations; iter++) {
    const randomTrades = generateRandomTrades(
      bars,
      tradeCount,
      Math.round(avgHold),
      rTarget,
      cost,
      rng,
    );
    baseWrSum += winRate(randomTrades);
    baseRSum += avgR(randomTrades);
  }

  const baseWr = baseWrSum / config.baselineIterations;
  const baseAvg = baseRSum / config.baselineIterations;

  // Pass if strategy meaningfully beats baseline
  const pass = stratAvg > baseAvg && stratWr > baseWr;

  return {
    pass,
    strategyWinRate: stratWr,
    baselineWinRate: baseWr,
    strategyAvgR: stratAvg,
    baselineAvgR: baseAvg,
    baselineIterations: config.baselineIterations,
  };
}

/**
 * Generate random trades: pick random entry bars, simulate a simple
 * R-based exit with matched hold time and target R.
 */
function generateRandomTrades(
  bars: readonly Bar[],
  count: number,
  avgHold: number,
  targetR: number,
  cost: CostModel,
  rng: Rng,
): LedgerEntry[] {
  const entries: LedgerEntry[] = [];
  const maxEntry = bars.length - avgHold - 1;
  if (maxEntry < 1) return entries;

  for (let i = 0; i < count; i++) {
    const entryBar = rng.int(1, maxEntry);
    const bar = bars[entryBar]!;
    const entryPrice = bar.c + cost.spreadPoints + cost.slippagePoints;

    // Simulate a random exit within avgHold bars
    const holdBars = Math.max(1, rng.int(1, avgHold * 2));
    const exitBar = Math.min(entryBar + holdBars, bars.length - 1);
    const exitBarData = bars[exitBar]!;
    const exitPrice = exitBarData.c - cost.spreadPoints - cost.slippagePoints;

    const pnl = exitPrice - entryPrice - cost.commissionPerTrade;
    // Use a fixed risk estimate (avg bar range as proxy)
    const riskEstimate = Math.abs(bar.h - bar.l) || 1;
    const rAchieved = pnl / riskEstimate;

    entries.push({
      entryBar,
      entryPrice,
      exitBar,
      exitPrice,
      direction: "long",
      rAchieved,
      barsHeld: exitBar - entryBar,
      exitReason: rAchieved >= targetR ? "target" : rAchieved <= -1 ? "stop" : "time_stop",
      detectorEvent: { type: "random_baseline", maturityIndex: entryBar },
      riskPerUnit: riskEstimate,
    });
  }

  return entries;
}

// ── Test 3: Degrees-of-freedom audit ─────────────────────────────────

function runDofAudit(
  compiled: CompiledSetup,
  bars: readonly Bar[],
  cost: CostModel,
  config: HarnessConfig,
  cache: ContentCache,
): DofAuditResult {
  const params = compiled.setup.detection.params;
  const numericParams = Object.entries(params).filter(([, v]) => typeof v === "number") as [
    string,
    number,
  ][];

  const sweeps: ParamSweepResult[] = [];

  for (const [paramName, baseValue] of numericParams) {
    const points: SweepPoint[] = [];
    const lo = baseValue * 0.5;
    const hi = baseValue * 1.5;
    const step = (hi - lo) / (config.sweepSteps - 1);

    for (let s = 0; s < config.sweepSteps; s++) {
      const testValue = lo + step * s;
      const testParams = { ...params, [paramName]: testValue };
      const testSetup: Setup = {
        ...compiled.setup,
        detection: { ...compiled.setup.detection, params: testParams },
      };

      const testCompiled = compileSetup(testSetup);
      if (testCompiled._tag !== "CompiledSetup") continue;

      const ledger = cache.getOrCompute(["simulate", testSetup, bars.length, cost], () =>
        simulate(testCompiled, bars, cost),
      );

      points.push({
        value: testValue,
        avgR: avgR(ledger.entries),
        winRate: winRate(ledger.entries),
        tradeCount: ledger.entries.length,
      });
    }

    // Compute coefficient of variation of avgR
    const avgRValues = points.map((p) => p.avgR);
    const mean =
      avgRValues.length > 0 ? avgRValues.reduce((a, b) => a + b, 0) / avgRValues.length : 0;
    const variance =
      avgRValues.length > 0
        ? avgRValues.reduce((s, v) => s + (v - mean) ** 2, 0) / avgRValues.length
        : 0;
    const stdDev = Math.sqrt(variance);
    const cv = mean !== 0 ? Math.abs(stdDev / mean) : Infinity;

    // Robust = CV < 1.0 (broad plateau); spike = CV > 1.0
    const isRobust = cv < 1.0;

    sweeps.push({ paramName, points, isRobust, avgRCv: cv });
  }

  // Pass if all numeric params show robust (plateau) behavior
  const pass = sweeps.length > 0 && sweeps.every((s) => s.isRobust);

  return {
    pass,
    paramCount: numericParams.length,
    sweeps,
  };
}

// ── Test 4: Trade-order Monte Carlo ──────────────────────────────────

function runMonteCarlo(
  compiled: CompiledSetup,
  bars: readonly Bar[],
  cost: CostModel,
  config: HarnessConfig,
  cache: ContentCache,
): MonteCarloResult {
  const ledger = cache.getOrCompute(["simulate", compiled.setup, bars.length, cost], () =>
    simulate(compiled, bars, cost),
  );

  const rValues = ledger.entries.map((e) => e.rAchieved);
  const realTotal = totalR(ledger.entries);
  const realMdd = maxDrawdown(rValues);

  if (rValues.length < 2) {
    return {
      pass: false,
      realTotalR: realTotal,
      realPercentile: 50,
      iterations: config.monteCarloIterations,
      p5TotalR: 0,
      p95TotalR: 0,
      realMaxDrawdown: realMdd,
      medianShuffledDrawdown: 0,
    };
  }

  const rng = new Rng(config.seed + 1000);
  const shuffledTotals: number[] = [];
  const shuffledDrawdowns: number[] = [];

  for (let i = 0; i < config.monteCarloIterations; i++) {
    const shuffled = [...rValues];
    rng.shuffle(shuffled);
    shuffledTotals.push(shuffled.reduce((a, b) => a + b, 0));
    shuffledDrawdowns.push(maxDrawdown(shuffled));
  }

  shuffledTotals.sort((a, b) => a - b);
  shuffledDrawdowns.sort((a, b) => a - b);

  // Percentile rank of real result
  const belowCount = shuffledTotals.filter((t) => t < realTotal).length;
  const realPercentile = (belowCount / shuffledTotals.length) * 100;

  const p5Idx = Math.floor(shuffledTotals.length * 0.05);
  const p95Idx = Math.floor(shuffledTotals.length * 0.95);
  const medianDdIdx = Math.floor(shuffledDrawdowns.length * 0.5);

  // Pass if real result is above the median shuffled result
  // (i.e., the ordering matters — edge is not just lucky sequence)
  const pass = realPercentile > 50;

  return {
    pass,
    realTotalR: realTotal,
    realPercentile,
    iterations: config.monteCarloIterations,
    p5TotalR: shuffledTotals[p5Idx]!,
    p95TotalR: shuffledTotals[p95Idx]!,
    realMaxDrawdown: realMdd,
    medianShuffledDrawdown: shuffledDrawdowns[medianDdIdx]!,
  };
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Run the full honesty harness on a compiled setup.
 * Returns a structured verdict: pass/fail per test + promote/shelve.
 *
 * Optionally accepts a ContentCache for sub-second incremental reruns.
 */
export function runHarness(
  compiled: CompiledSetup,
  bars: readonly Bar[],
  cost: CostModel,
  config: HarnessConfig = DEFAULT_HARNESS_CONFIG,
  cache: ContentCache = new ContentCache(),
): HarnessVerdict {
  const holdout = runHoldout(compiled, bars, cost, config, cache);
  const baseline = runBaseline(compiled, bars, cost, config, cache);
  const dofAudit = runDofAudit(compiled, bars, cost, config, cache);
  const monteCarlo = runMonteCarlo(compiled, bars, cost, config, cache);

  // Promote only if ALL four tests pass
  const recommendation =
    holdout.pass && baseline.pass && dofAudit.pass && monteCarlo.pass ? "promote" : "shelve";

  return { holdout, baseline, dofAudit, monteCarlo, recommendation };
}
