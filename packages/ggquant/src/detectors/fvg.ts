// ──────────────────────────────────────────────────────────────────────
// ggquant — Fair Value Gap (FVG) detector
// SPEC.md §3 worked example. Matches fvg-detector-instrument.html.
//
// Pure function: bars in, FvgEvent[] out.
// Bullish FVG: bar1.high < bar3.low (unfilled gap in delivery).
// Bearish FVG: bar1.low  > bar3.high (mirror).
// Size gate: gap height >= min_size_atr × ATR at bar3.
// Maturity: bar3's index (event confirmed only when bar3 closes).
// ──────────────────────────────────────────────────────────────────────

import type { Bar, FvgEvent } from "../detector-types.js";
import { atrSeries } from "../atr.js";

/**
 * Detect Fair Value Gaps across a bar window.
 *
 * @param bars       Left-bounded window of OHLC bars.
 * @param minSizeAtr Minimum gap height as a multiple of ATR.
 * @param atrPeriod  ATR lookback period.
 * @returns          Array of FvgEvent for every qualifying gap.
 */
export function detectFvg(
  bars: readonly Bar[],
  minSizeAtr: number,
  atrPeriod: number,
): readonly FvgEvent[] {
  if (bars.length < 3) return [];

  const atr = atrSeries(bars, atrPeriod);
  const events: FvgEvent[] = [];

  for (let i = 2; i < bars.length; i++) {
    const bar1 = bars[i - 2]!;
    const bar3 = bars[i]!;
    const currentAtr = atr[i]!;
    const threshold = currentAtr * minSizeAtr;

    let direction: "bullish" | "bearish";
    let upper: number;
    let lower: number;

    if (bar1.h < bar3.l) {
      // Bullish FVG: gap between bar1 high and bar3 low
      direction = "bullish";
      lower = bar1.h;
      upper = bar3.l;
    } else if (bar1.l > bar3.h) {
      // Bearish FVG: gap between bar3 high and bar1 low
      direction = "bearish";
      upper = bar1.l;
      lower = bar3.h;
    } else {
      continue;
    }

    const gapHeight = upper - lower;
    if (gapHeight < threshold) continue;

    events.push({
      type: "fvg",
      direction,
      bars: [i - 2, i - 1, i],
      upper,
      lower,
      midpoint: (upper + lower) / 2,
      gapAtr: gapHeight / currentAtr,
      maturityIndex: i,
    });
  }

  return events;
}
