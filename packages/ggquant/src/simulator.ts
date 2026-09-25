// ──────────────────────────────────────────────────────────────────────
// ggquant — Trajectory Simulator (Stage 03)
// SPEC.md §4: pure function (compiledSetup, bars) → trade ledger.
// Fills modelled with realistic spread, slippage, and cost.
// ──────────────────────────────────────────────────────────────────────

import type { Bar, DetectorEvent } from "./detector-types.js";
import type { CompiledSetup } from "./types.js";
import type { CostModel, LedgerEntry, TradeLedger } from "./simulator-types.js";
import { getDetector } from "./detector-registry.js";

// ── Price resolution ─────────────────────────────────────────────────

/**
 * Resolve a named price reference from a detector event.
 * For FVG events: fvg_midpoint, fvg_upper, fvg_lower.
 * Extensible to other detector types via their event shapes.
 */
function resolvePrice(ref: string, event: DetectorEvent): number {
  const e = event as unknown as Record<string, unknown>;
  switch (ref) {
    case "fvg_midpoint":
      return e["midpoint"] as number;
    case "fvg_upper":
      return e["upper"] as number;
    case "fvg_lower":
      return e["lower"] as number;
    case "ob_midpoint":
      return e["midpoint"] as number;
    case "ob_upper":
      return e["upper"] as number;
    case "ob_lower":
      return e["lower"] as number;
    default:
      throw new Error(`Unknown price reference: "${ref}"`);
  }
}

// ── Fill logic ───────────────────────────────────────────────────────

/**
 * Check whether a limit order fills on the given bar.
 * Long limit: fills if bar.low <= price (price was available).
 * Short limit: fills if bar.high >= price.
 */
function limitFills(bar: Bar, price: number, direction: "long" | "short"): boolean {
  return direction === "long" ? bar.l <= price : bar.h >= price;
}

/**
 * Apply cost model to an entry price.
 * Long: buy higher (spread + slippage adverse).
 * Short: sell lower.
 */
function adjustEntry(price: number, direction: "long" | "short", cost: CostModel): number {
  const adverse = cost.spreadPoints + cost.slippagePoints;
  return direction === "long" ? price + adverse : price - adverse;
}

/**
 * Apply cost model to an exit price.
 * Long: sell lower (spread + slippage adverse).
 * Short: buy higher.
 */
function adjustExit(price: number, direction: "long" | "short", cost: CostModel): number {
  const adverse = cost.spreadPoints + cost.slippagePoints;
  return direction === "long" ? price - adverse : price + adverse;
}

// ── Core simulator ───────────────────────────────────────────────────

/**
 * Simulate a compiled setup over a bar series.
 * Pure function: same inputs → identical ledger, every run.
 */
export function simulate(
  compiled: CompiledSetup,
  bars: readonly Bar[],
  cost: CostModel,
): TradeLedger {
  const { setup } = compiled;

  // 1. Run detector
  const detectorFn = getDetector(setup.detection.detector);
  if (!detectorFn) {
    throw new Error(`Detector "${setup.detection.detector}" not found in registry`);
  }
  const events = detectorFn(bars, setup.detection.params);

  // 2. Derive direction from event (bullish → long, bearish → short)
  const entries: LedgerEntry[] = [];

  for (const event of events) {
    const direction = deriveDirection(event);
    if (!direction) continue;

    // 3. Resolve prices from event geometry
    const rawEntry = resolvePrice(setup.entryTrigger.priceRef, event);
    const rawStop = resolvePrice(setup.invalidation.priceRef, event);

    // Apply invalidation offset
    const stopPrice =
      direction === "long"
        ? rawStop - setup.invalidation.offsetPoints
        : rawStop + setup.invalidation.offsetPoints;

    // Risk per unit (distance from raw entry to stop, before costs)
    const riskPerUnit = Math.abs(rawEntry - stopPrice);
    if (riskPerUnit <= 0) continue;

    // Resolve target price(s) — for now handle R-multiple (first level)
    const targetPrice = resolveTargetPrice(setup.target.levels, rawEntry, riskPerUnit, direction);
    if (targetPrice === null) continue;

    // 4. Walk forward from maturity bar to find entry fill
    const maturity = event.maturityIndex;
    const timeLimit = maturity + setup.invalidation.timeStopBars;

    let filled = false;
    let entryBar = -1;
    let actualEntry = 0;

    for (let b = maturity + 1; b < bars.length && b <= timeLimit; b++) {
      if (setup.entryTrigger.orderType === "limit") {
        if (limitFills(bars[b]!, rawEntry, direction)) {
          filled = true;
          entryBar = b;
          actualEntry = adjustEntry(rawEntry, direction, cost);
          break;
        }
      } else {
        // Market order: fill at next bar's open
        entryBar = b;
        actualEntry = adjustEntry(bars[b]!.o, direction, cost);
        filled = true;
        break;
      }
    }

    if (!filled) continue;

    // 5. Walk forward from entry to find exit
    const result = walkToExit(
      bars,
      entryBar,
      actualEntry,
      stopPrice,
      targetPrice,
      direction,
      cost,
      riskPerUnit,
    );

    entries.push({
      entryBar,
      entryPrice: actualEntry,
      exitBar: result.exitBar,
      exitPrice: result.exitPrice,
      direction,
      rAchieved: result.rAchieved,
      barsHeld: result.exitBar - entryBar,
      exitReason: result.exitReason,
      detectorEvent: event,
      riskPerUnit,
    });
  }

  return { entries };
}

// ── Helpers ──────────────────────────────────────────────────────────

function deriveDirection(event: DetectorEvent): "long" | "short" | null {
  const e = event as unknown as Record<string, unknown>;
  const dir = e["direction"];
  if (dir === "bullish") return "long";
  if (dir === "bearish") return "short";
  return null;
}

function resolveTargetPrice(
  levels: CompiledSetup["setup"]["target"]["levels"],
  entryPrice: number,
  riskPerUnit: number,
  direction: "long" | "short",
): number | null {
  if (levels.length === 0) return null;

  const first = levels[0]!;
  if (first.kind === "r_multiple") {
    return direction === "long"
      ? entryPrice + riskPerUnit * first.value
      : entryPrice - riskPerUnit * first.value;
  }
  // price_ref and partial_scale: extensible in later phases
  return null;
}

interface ExitResult {
  exitBar: number;
  exitPrice: number;
  rAchieved: number;
  exitReason: "target" | "stop" | "time_stop";
}

function walkToExit(
  bars: readonly Bar[],
  entryBar: number,
  actualEntry: number,
  stopPrice: number,
  targetPrice: number,
  direction: "long" | "short",
  cost: CostModel,
  riskPerUnit: number,
): ExitResult {
  for (let b = entryBar + 1; b < bars.length; b++) {
    const bar = bars[b]!;

    // Check stop hit first (conservative: stop checked before target on same bar)
    const stopHit = direction === "long" ? bar.l <= stopPrice : bar.h >= stopPrice;

    // Check target hit
    const targetHit = direction === "long" ? bar.h >= targetPrice : bar.l <= targetPrice;

    if (stopHit) {
      const exitPrice = adjustExit(stopPrice, direction, cost);
      const pnl = direction === "long" ? exitPrice - actualEntry : actualEntry - exitPrice;
      return {
        exitBar: b,
        exitPrice,
        rAchieved: (pnl - cost.commissionPerTrade) / riskPerUnit,
        exitReason: "stop",
      };
    }

    if (targetHit) {
      const exitPrice = adjustExit(targetPrice, direction, cost);
      const pnl = direction === "long" ? exitPrice - actualEntry : actualEntry - exitPrice;
      return {
        exitBar: b,
        exitPrice,
        rAchieved: (pnl - cost.commissionPerTrade) / riskPerUnit,
        exitReason: "target",
      };
    }
  }

  // Ran out of bars — forced exit at last bar's close
  const lastBar = bars.length - 1;
  const exitPrice = adjustExit(bars[lastBar]!.c, direction, cost);
  const pnl = direction === "long" ? exitPrice - actualEntry : actualEntry - exitPrice;
  return {
    exitBar: lastBar,
    exitPrice,
    rAchieved: (pnl - cost.commissionPerTrade) / riskPerUnit,
    exitReason: "time_stop",
  };
}
