// ──────────────────────────────────────────────────────────────────────
// ggquant — Honesty Harness types (Stage 04)
// SPEC.md §5: four-test verdict structure.
// ──────────────────────────────────────────────────────────────────────

/** Result of a single walk-forward fold. */
export interface FoldResult {
  readonly foldIndex: number;
  readonly inSampleTrades: number;
  readonly outOfSampleTrades: number;
  readonly inSampleWinRate: number;
  readonly outOfSampleWinRate: number;
  readonly inSampleAvgR: number;
  readonly outOfSampleAvgR: number;
}

/** Test 1: Out-of-sample holdout with walk-forward folds. */
export interface HoldoutResult {
  readonly pass: boolean;
  readonly folds: readonly FoldResult[];
  /** Average out-of-sample win rate across all folds. */
  readonly avgOosWinRate: number;
  /** Average out-of-sample R across all folds. */
  readonly avgOosAvgR: number;
}

/** Test 2: Baseline comparison. */
export interface BaselineResult {
  readonly pass: boolean;
  /** Win rate of the strategy. */
  readonly strategyWinRate: number;
  /** Average win rate of random baselines. */
  readonly baselineWinRate: number;
  /** Strategy average R. */
  readonly strategyAvgR: number;
  /** Baseline average R. */
  readonly baselineAvgR: number;
  /** Number of baseline iterations run. */
  readonly baselineIterations: number;
}

/** A single parameter sweep point. */
export interface SweepPoint {
  readonly value: number;
  readonly avgR: number;
  readonly winRate: number;
  readonly tradeCount: number;
}

/** Test 3: Degrees-of-freedom audit for one parameter. */
export interface ParamSweepResult {
  readonly paramName: string;
  readonly points: readonly SweepPoint[];
  /** Is the result a broad plateau (robust) vs sharp spike (overfit)? */
  readonly isRobust: boolean;
  /** Coefficient of variation of avgR across sweep points. */
  readonly avgRCv: number;
}

/** Test 3 aggregate. */
export interface DofAuditResult {
  readonly pass: boolean;
  readonly paramCount: number;
  readonly sweeps: readonly ParamSweepResult[];
}

/** Test 4: Trade-order Monte Carlo. */
export interface MonteCarloResult {
  readonly pass: boolean;
  /** The real strategy's total R. */
  readonly realTotalR: number;
  /** Percentile rank of real result within shuffled distribution. */
  readonly realPercentile: number;
  /** Number of Monte Carlo iterations. */
  readonly iterations: number;
  /** 5th percentile of shuffled total R distribution. */
  readonly p5TotalR: number;
  /** 95th percentile of shuffled total R distribution. */
  readonly p95TotalR: number;
  /** Max drawdown of real equity curve (in R). */
  readonly realMaxDrawdown: number;
  /** Median max drawdown across shuffled curves. */
  readonly medianShuffledDrawdown: number;
}

/** The full four-test verdict. */
export interface HarnessVerdict {
  readonly holdout: HoldoutResult;
  readonly baseline: BaselineResult;
  readonly dofAudit: DofAuditResult;
  readonly monteCarlo: MonteCarloResult;
  /** Overall recommendation. */
  readonly recommendation: "promote" | "shelve";
}

/** Configuration for running the honesty harness. */
export interface HarnessConfig {
  /** Number of walk-forward folds (default: 5). */
  readonly folds: number;
  /** Number of random baseline iterations (default: 200). */
  readonly baselineIterations: number;
  /** Number of Monte Carlo shuffle iterations (default: 1000). */
  readonly monteCarloIterations: number;
  /** Parameter sweep: values to test for each numeric detector param. */
  readonly sweepSteps: number;
  /** Seed for deterministic random number generation. */
  readonly seed: number;
}

export const DEFAULT_HARNESS_CONFIG: HarnessConfig = {
  folds: 5,
  baselineIterations: 200,
  monteCarloIterations: 1000,
  sweepSteps: 11,
  seed: 42,
};
