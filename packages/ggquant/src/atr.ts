// ──────────────────────────────────────────────────────────────────────
// ggquant — ATR (Average True Range) utility
// Pure function, no lookahead: ATR[i] uses only bars 0..i.
// ──────────────────────────────────────────────────────────────────────

import type { Bar } from "./detector-types.js";

/**
 * Compute ATR series for the given bars and period.
 * Returns an array of the same length as `bars`, where atr[i] is the
 * average true range using bars max(0, i-period+1)..i.
 *
 * No lookahead: atr[i] never reads bar i+1 or later.
 */
export function atrSeries(bars: readonly Bar[], period: number): number[] {
  const tr: number[] = [];
  const atr: number[] = [];

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    if (i === 0) {
      tr[i] = b.h - b.l;
    } else {
      const prevClose = bars[i - 1]!.c;
      tr[i] = Math.max(b.h - b.l, Math.abs(b.h - prevClose), Math.abs(b.l - prevClose));
    }

    const start = Math.max(0, i - period + 1);
    let sum = 0;
    for (let k = start; k <= i; k++) {
      sum += tr[k]!;
    }
    atr[i] = sum / (i - start + 1);
  }

  return atr;
}
