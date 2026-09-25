// ──────────────────────────────────────────────────────────────────────
// ggquant — Detector contract types (Stage 02)
// SPEC.md §3: The detector contract — five clauses.
// ──────────────────────────────────────────────────────────────────────

/** A single OHLC bar. */
export interface Bar {
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
}

/**
 * Base interface for all detector events.
 * Contract clause 3: events, not booleans — typed objects with
 * a time index and price geometry.
 */
export interface DetectorEvent {
  /** Detector type identifier (e.g. "fvg"). */
  readonly type: string;
  /**
   * Contract clause 4: maturity timestamp.
   * Bar index at which this event became confirmed.
   * The setup may only act on an event at or after this index.
   */
  readonly maturityIndex: number;
}

/** FVG-specific event emitted by the fvg detector. */
export interface FvgEvent extends DetectorEvent {
  readonly type: "fvg";
  readonly direction: "bullish" | "bearish";
  /** The three bar indices forming the FVG: [bar1, bar2, bar3]. */
  readonly bars: readonly [number, number, number];
  /** Upper bound of the gap (price). */
  readonly upper: number;
  /** Lower bound of the gap (price). */
  readonly lower: number;
  /** Midpoint of the gap: (upper + lower) / 2. */
  readonly midpoint: number;
  /** Gap height as a multiple of ATR at the formation bar. */
  readonly gapAtr: number;
}

/**
 * A detector is a pure function: bars in, typed events out.
 * Contract clause 1: no state, no I/O, no randomness.
 * Contract clause 2: the window is left-bounded — no lookahead.
 * Contract clause 5: all thresholds are explicit arguments.
 */
export type DetectorFn<E extends DetectorEvent = DetectorEvent> = (
  bars: readonly Bar[],
  params: Readonly<Record<string, number | string | boolean>>,
) => readonly E[];
