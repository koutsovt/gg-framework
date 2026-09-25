// ──────────────────────────────────────────────────────────────────────
// ggquant — Decision Log (Stage 05)
// SPEC.md §6: emit typed DecisionRecord objects.
// Storage is ggarch's responsibility — this module emits, not stores.
// ──────────────────────────────────────────────────────────────────────

import type { CompiledSetup, Setup, CompileResult } from "./types.js";
import type { HarnessVerdict } from "./harness-types.js";

// ── DecisionRecord type ──────────────────────────────────────────────

export type DecisionKind = "setup-compiled" | "parameter-chosen" | "harness-verdict";

export interface DecisionRecord {
  readonly kind: DecisionKind;
  /** ISO-8601 timestamp. */
  readonly timestamp: string;
  /** Subject identifier: setup name + version. */
  readonly subject: string;
  /** The "why", written before any result is seen. */
  readonly rationale: string;
  /** Kind-specific payload. */
  readonly payload: Readonly<Record<string, unknown>>;
}

// ── DecisionStore interface (ggarch adapter) ─────────────────────────

/**
 * Pluggable store for DecisionRecords.
 * When ggarch is built, implement this interface to wire in.
 * Until then, the InMemoryStore collects records for testing.
 */
export interface DecisionStore {
  append(record: DecisionRecord): void;
  list(): readonly DecisionRecord[];
}

/** In-memory store for testing and pre-ggarch usage. */
export class InMemoryStore implements DecisionStore {
  private records: DecisionRecord[] = [];

  append(record: DecisionRecord): void {
    this.records.push(record);
  }

  list(): readonly DecisionRecord[] {
    return this.records;
  }
}

// ── Emit helpers (the three emit points from SPEC §6) ────────────────

function subject(setup: Setup): string {
  return `${setup.metadata.name}@${setup.metadata.version}`;
}

/**
 * Emit point 1: A setup compiles.
 * Captures the full setup, every bound parameter, and the thesis.
 */
export function emitSetupCompiled(
  result: CompileResult,
  store: DecisionStore,
): DecisionRecord | null {
  if (result._tag !== "CompiledSetup") return null;

  const setup = result.setup;
  const record: DecisionRecord = {
    kind: "setup-compiled",
    timestamp: new Date().toISOString(),
    subject: subject(setup),
    rationale: setup.metadata.thesis,
    payload: {
      detector: setup.detection.detector,
      params: setup.detection.params,
      entryTrigger: setup.entryTrigger,
      invalidation: setup.invalidation,
      target: setup.target,
      contextFilter: setup.contextFilter,
      positionModel: setup.positionModel,
    },
  };

  store.append(record);
  return record;
}

/**
 * Emit point 2: A parameter value is chosen.
 * Must be called BEFORE the backtest is run — the rationale is
 * timestamped before the result, guarding against curve-fitting.
 */
export function emitParameterChosen(
  setup: Setup,
  paramName: string,
  paramValue: number | string | boolean,
  rationale: string,
  store: DecisionStore,
): DecisionRecord {
  const record: DecisionRecord = {
    kind: "parameter-chosen",
    timestamp: new Date().toISOString(),
    subject: subject(setup),
    rationale,
    payload: {
      paramName,
      paramValue,
      allParams: setup.detection.params,
    },
  };

  store.append(record);
  return record;
}

/**
 * Emit point 3: The honesty harness returns a verdict.
 * Captures pass/fail on each test, the numbers, and the decision.
 */
export function emitHarnessVerdict(
  compiled: CompiledSetup,
  verdict: HarnessVerdict,
  store: DecisionStore,
): DecisionRecord {
  const record: DecisionRecord = {
    kind: "harness-verdict",
    timestamp: new Date().toISOString(),
    subject: subject(compiled.setup),
    rationale:
      verdict.recommendation === "promote"
        ? "All four honesty tests passed — setup promoted."
        : "One or more honesty tests failed — setup shelved.",
    payload: {
      recommendation: verdict.recommendation,
      holdout: {
        pass: verdict.holdout.pass,
        avgOosWinRate: verdict.holdout.avgOosWinRate,
        avgOosAvgR: verdict.holdout.avgOosAvgR,
        foldCount: verdict.holdout.folds.length,
      },
      baseline: {
        pass: verdict.baseline.pass,
        strategyWinRate: verdict.baseline.strategyWinRate,
        baselineWinRate: verdict.baseline.baselineWinRate,
        strategyAvgR: verdict.baseline.strategyAvgR,
        baselineAvgR: verdict.baseline.baselineAvgR,
      },
      dofAudit: {
        pass: verdict.dofAudit.pass,
        paramCount: verdict.dofAudit.paramCount,
        sweeps: verdict.dofAudit.sweeps.map((s) => ({
          paramName: s.paramName,
          isRobust: s.isRobust,
          avgRCv: s.avgRCv,
        })),
      },
      monteCarlo: {
        pass: verdict.monteCarlo.pass,
        realTotalR: verdict.monteCarlo.realTotalR,
        realPercentile: verdict.monteCarlo.realPercentile,
        iterations: verdict.monteCarlo.iterations,
      },
    },
  };

  store.append(record);
  return record;
}
