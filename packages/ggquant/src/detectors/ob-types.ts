// ──────────────────────────────────────────────────────────────────────
// ggquant — Order Block event type
// ──────────────────────────────────────────────────────────────────────

import type { DetectorEvent } from "../detector-types.js";

/** Order Block event emitted by the ob detector. */
export interface ObEvent extends DetectorEvent {
  readonly type: "ob";
  readonly direction: "bullish" | "bearish";
  /** Index of the candidate candle (the order block itself). */
  readonly candidateBar: number;
  /** Index of the bar that confirmed the displacement. */
  readonly displacementBar: number;
  /** Upper bound of the OB zone (body high). */
  readonly upper: number;
  /** Lower bound of the OB zone (body low). */
  readonly lower: number;
  /** Midpoint of the OB zone. */
  readonly midpoint: number;
  /** Displacement size as a multiple of ATR. */
  readonly displacementAtr: number;
}
