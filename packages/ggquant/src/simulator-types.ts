// ──────────────────────────────────────────────────────────────────────
// ggquant — Trajectory Simulator types (Stage 03)
// SPEC.md §4: pure function (setup, bars) → trade ledger.
// ──────────────────────────────────────────────────────────────────────

import type { DetectorEvent } from "./detector-types.js";

/** Cost model for realistic fill simulation. Costs are not optional. */
export interface CostModel {
  /** Half-spread in price points applied to both entry and exit. */
  readonly spreadPoints: number;
  /** Adverse slippage in price points per fill. */
  readonly slippagePoints: number;
  /** Fixed commission per round-trip trade (deducted from P&L). */
  readonly commissionPerTrade: number;
}

/** A single trade in the ledger. */
export interface LedgerEntry {
  /** Bar index at which the entry filled. */
  readonly entryBar: number;
  /** Actual entry price after spread + slippage. */
  readonly entryPrice: number;
  /** Bar index at which the exit occurred. */
  readonly exitBar: number;
  /** Actual exit price after spread + slippage. */
  readonly exitPrice: number;
  /** Trade direction derived from detector event. */
  readonly direction: "long" | "short";
  /** R achieved: (exit - entry) / risk, net of costs. Negative = loss. */
  readonly rAchieved: number;
  /** Number of bars the trade was held. */
  readonly barsHeld: number;
  /** Why the trade exited. */
  readonly exitReason: "target" | "stop" | "time_stop";
  /** The detector event that armed this trade. */
  readonly detectorEvent: DetectorEvent;
  /** Raw risk per unit (stop distance) before costs. */
  readonly riskPerUnit: number;
}

/** Output of the trajectory simulator. */
export interface TradeLedger {
  readonly entries: readonly LedgerEntry[];
}
