// ggquant — deterministic ICT setup edge validation
// See ggquant/SPEC.md for the full design.

export type {
  Setup,
  CompiledSetup,
  CompileResult,
  Rejection,
  DetectionBlock,
  ContextFilterBlock,
  SessionWindow,
  HtfFilter,
  EntryTriggerBlock,
  InvalidationBlock,
  TargetBlock,
  TargetLevel,
  PartialLevel,
  PositionModelBlock,
  MetadataBlock,
} from "./types.js";

export { compileSetup } from "./definition-layer.js";

export type { Bar, DetectorEvent, FvgEvent, DetectorFn } from "./detector-types.js";

export { atrSeries } from "./atr.js";
export { detectFvg } from "./detectors/fvg.js";
export type { ObEvent } from "./detectors/ob-types.js";
export { detectOb } from "./detectors/ob.js";
export { getDetector, listDetectors } from "./detector-registry.js";

export type { CostModel, LedgerEntry, TradeLedger } from "./simulator-types.js";
export { simulate } from "./simulator.js";

export type {
  HarnessVerdict,
  HarnessConfig,
  HoldoutResult,
  BaselineResult,
  DofAuditResult,
  MonteCarloResult,
  ParamSweepResult,
  SweepPoint,
  FoldResult,
} from "./harness-types.js";
export { DEFAULT_HARNESS_CONFIG } from "./harness-types.js";
export { runHarness } from "./harness.js";
export { ContentCache } from "./cache.js";
export { Rng } from "./rng.js";

export type { DecisionRecord, DecisionKind, DecisionStore } from "./decision-log.js";
export {
  InMemoryStore,
  emitSetupCompiled,
  emitParameterChosen,
  emitHarnessVerdict,
} from "./decision-log.js";
export { GgarchStore } from "./ggarch-store.js";
