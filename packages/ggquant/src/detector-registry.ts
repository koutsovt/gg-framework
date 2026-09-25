// ──────────────────────────────────────────────────────────────────────
// ggquant — Detector Registry (Stage 02)
// Maps detector names to their pure-function implementations.
// ──────────────────────────────────────────────────────────────────────

import type { Bar, DetectorEvent, DetectorFn } from "./detector-types.js";
import { detectFvg } from "./detectors/fvg.js";
import { detectOb } from "./detectors/ob.js";

/** Wrapper that adapts the typed fvg detector to the generic DetectorFn signature. */
function fvgDetector(
  bars: readonly Bar[],
  params: Readonly<Record<string, number | string | boolean>>,
): readonly DetectorEvent[] {
  const minSizeAtr = params["min_size_atr"];
  const atrPeriod = params["atr_period"];

  if (typeof minSizeAtr !== "number" || typeof atrPeriod !== "number") {
    throw new Error("fvg detector requires numeric params: min_size_atr, atr_period");
  }

  return detectFvg(bars, minSizeAtr, atrPeriod);
}

/** Wrapper that adapts the typed ob detector to the generic DetectorFn signature. */
function obDetector(
  bars: readonly Bar[],
  params: Readonly<Record<string, number | string | boolean>>,
): readonly DetectorEvent[] {
  const minDisplacementAtr = params["min_displacement_atr"];
  const atrPeriod = params["atr_period"];

  if (typeof minDisplacementAtr !== "number" || typeof atrPeriod !== "number") {
    throw new Error("ob detector requires numeric params: min_displacement_atr, atr_period");
  }

  const displacementBars = params["displacement_bars"];
  return detectOb(
    bars,
    minDisplacementAtr,
    atrPeriod,
    typeof displacementBars === "number" ? displacementBars : 3,
  );
}

const registry = new Map<string, DetectorFn>([
  ["fvg", fvgDetector],
  ["ob", obDetector],
]);

/** Look up a detector by name. Returns undefined if not registered. */
export function getDetector(name: string): DetectorFn | undefined {
  return registry.get(name);
}

/** List all registered detector names. */
export function listDetectors(): readonly string[] {
  return [...registry.keys()];
}
