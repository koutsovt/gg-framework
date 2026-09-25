// ──────────────────────────────────────────────────────────────────────
// ggquant — Order Block (OB) detector
//
// Pure function: bars in, ObEvent[] out.
// Bullish OB: last bearish candle before a bullish displacement.
// Bearish OB: last bullish candle before a bearish displacement.
//
// Displacement = a move of at least min_displacement_atr × ATR
// measured from the candidate candle's close to the displacement
// candle's close, within a lookforward window of displacement_bars.
//
// The OB zone is the candidate candle's body range.
// Maturity: the displacement candle's index (confirmed when
// displacement closes, not before).
// ──────────────────────────────────────────────────────────────────────

import type { Bar } from "../detector-types.js";
import type { ObEvent } from "./ob-types.js";
import { atrSeries } from "../atr.js";

/**
 * Detect Order Blocks across a bar window.
 *
 * @param bars                  Left-bounded window of OHLC bars.
 * @param minDisplacementAtr    Minimum displacement size as ATR multiple.
 * @param atrPeriod             ATR lookback period.
 * @param displacementBars      Max bars to look forward for displacement (default 3).
 * @returns                     Array of ObEvent for every qualifying OB.
 */
export function detectOb(
  bars: readonly Bar[],
  minDisplacementAtr: number,
  atrPeriod: number,
  displacementBars: number = 3,
): readonly ObEvent[] {
  if (bars.length < 2) return [];

  const atr = atrSeries(bars, atrPeriod);
  const events: ObEvent[] = [];

  for (let i = 0; i < bars.length - 1; i++) {
    const candidate = bars[i]!;
    const isBearishCandle = candidate.c < candidate.o;
    const isBullishCandle = candidate.c > candidate.o;

    if (!isBearishCandle && !isBullishCandle) continue;

    // Look forward for displacement
    const maxJ = Math.min(i + displacementBars, bars.length - 1);

    for (let j = i + 1; j <= maxJ; j++) {
      const dispBar = bars[j]!;
      const currentAtr = atr[j]!;
      if (currentAtr <= 0) continue;

      const threshold = currentAtr * minDisplacementAtr;

      if (isBearishCandle) {
        // Bullish OB: bearish candle followed by bullish displacement
        const displacement = dispBar.c - candidate.c;
        if (displacement >= threshold) {
          events.push({
            type: "ob",
            direction: "bullish",
            candidateBar: i,
            displacementBar: j,
            upper: Math.max(candidate.o, candidate.c),
            lower: Math.min(candidate.o, candidate.c),
            midpoint: (Math.max(candidate.o, candidate.c) + Math.min(candidate.o, candidate.c)) / 2,
            displacementAtr: displacement / currentAtr,
            maturityIndex: j,
          });
          break; // One OB per candidate candle
        }
      }

      if (isBullishCandle) {
        // Bearish OB: bullish candle followed by bearish displacement
        const displacement = candidate.c - dispBar.c;
        if (displacement >= threshold) {
          events.push({
            type: "ob",
            direction: "bearish",
            candidateBar: i,
            displacementBar: j,
            upper: Math.max(candidate.o, candidate.c),
            lower: Math.min(candidate.o, candidate.c),
            midpoint: (Math.max(candidate.o, candidate.c) + Math.min(candidate.o, candidate.c)) / 2,
            displacementAtr: displacement / currentAtr,
            maturityIndex: j,
          });
          break;
        }
      }
    }
  }

  return events;
}
