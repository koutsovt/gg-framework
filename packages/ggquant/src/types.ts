// ──────────────────────────────────────────────────────────────────────
// ggquant — Definition Layer types (Stage 01)
// SPEC.md §2: The seven required blocks of a Setup.
// ──────────────────────────────────────────────────────────────────────

// ── Detector reference ───────────────────────────────────────────────

/**
 * A fully-bound reference to a registered detector.
 * Every parameter must be an explicit value — no ranges, no defaults.
 */
export interface DetectionBlock {
  /** Name of the registered detector (e.g. "fvg"). */
  readonly detector: string;
  /** Fully-bound parameter map — every key must have a concrete value. */
  readonly params: Readonly<Record<string, number | string | boolean>>;
}

// ── Context filter ───────────────────────────────────────────────────

/** Explicit session window: numeric edges + IANA timezone. */
export interface SessionWindow {
  /** Label (e.g. "London"). Informational only. */
  readonly label: string;
  /** Start time as "HH:MM" in 24h format. */
  readonly startTime: string;
  /** End time as "HH:MM" in 24h format. */
  readonly endTime: string;
  /** IANA timezone (e.g. "Europe/London"). */
  readonly timezone: string;
}

/** Higher-timeframe directional state required for the setup. */
export interface HtfFilter {
  /** Timeframe identifier (e.g. "1H", "4H", "1D"). */
  readonly timeframe: string;
  /** Required directional state. */
  readonly direction: "bullish" | "bearish";
}

export interface ContextFilterBlock {
  /** Session window with explicit numeric edges and timezone. */
  readonly sessionWindow: SessionWindow;
  /** Optional higher-timeframe directional filter. */
  readonly htfFilter?: HtfFilter;
  /** Days of week the setup is active. 0=Sunday..6=Saturday. */
  readonly daysOfWeek?: readonly number[];
}

// ── Entry trigger ────────────────────────────────────────────────────

export interface EntryTriggerBlock {
  /** Order type determining when the entry fires. */
  readonly orderType: "limit" | "market";
  /**
   * Named price reference for the entry.
   * Must resolve to a computed value from the detection event
   * (e.g. "fvg_midpoint", "fvg_upper", "fvg_lower").
   */
  readonly priceRef: string;
  /**
   * For market orders: the bar-relative moment the entry fires
   * (e.g. "confirmation_candle_close"). Omit for limit orders.
   */
  readonly moment?: string;
}

// ── Invalidation ─────────────────────────────────────────────────────

export interface InvalidationBlock {
  /** Named price reference for the stop level (e.g. "fvg_lower", "swing_low"). */
  readonly priceRef: string;
  /** Offset from the price reference in points (e.g. buffer beyond the level). */
  readonly offsetPoints: number;
  /** Time-stop: invalidate if not filled within N bars. */
  readonly timeStopBars: number;
}

// ── Target ───────────────────────────────────────────────────────────

export type TargetLevel =
  | { readonly kind: "r_multiple"; readonly value: number }
  | { readonly kind: "price_ref"; readonly ref: string }
  | { readonly kind: "partial_scale"; readonly levels: readonly PartialLevel[] };

export interface PartialLevel {
  /** Fraction of position to exit at this level (0–1). */
  readonly fraction: number;
  /** R multiple at which to exit this partial. */
  readonly rMultiple: number;
}

export interface TargetBlock {
  readonly levels: readonly TargetLevel[];
}

// ── Position model ───────────────────────────────────────────────────

export interface PositionModelBlock {
  /** Risk per trade as a fraction of account (e.g. 0.01 = 1%). */
  readonly riskFraction: number;
}

// ── Metadata ─────────────────────────────────────────────────────────

export interface MetadataBlock {
  readonly name: string;
  readonly version: string;
  readonly author: string;
  /**
   * Free-text thesis: why this setup should have an edge.
   * Required — it is the hypothesis the honesty harness will try to kill.
   */
  readonly thesis: string;
}

// ── Setup (the top-level object) ─────────────────────────────────────

/** A raw setup before compilation. Every field must be fully bound. */
export interface Setup {
  readonly detection: DetectionBlock;
  readonly contextFilter: ContextFilterBlock;
  readonly entryTrigger: EntryTriggerBlock;
  readonly invalidation: InvalidationBlock;
  readonly target: TargetBlock;
  readonly positionModel: PositionModelBlock;
  readonly metadata: MetadataBlock;
}

// ── Compile result (discriminated union) ─────────────────────────────

/** A setup that passed compilation — structurally identical but branded. */
export interface CompiledSetup {
  readonly _tag: "CompiledSetup";
  readonly setup: Setup;
}

/** A single rejection reason. */
export interface Rejection {
  readonly rule:
    "unbound_parameter" | "discretion_word" | "underspecified_reference" | "missing_invalidation";
  /** Human-readable message. */
  readonly message: string;
  /** The path/field that caused the rejection. */
  readonly path: string;
  /** For discretion_word: the offending word. */
  readonly word?: string;
}

export type CompileResult =
  CompiledSetup | { readonly _tag: "Rejected"; readonly rejections: readonly Rejection[] };
