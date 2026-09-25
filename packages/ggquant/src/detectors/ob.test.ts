import { describe, it, expect } from "vitest";
import { detectOb } from "./ob.js";
import type { Bar } from "../detector-types.js";
import type { ObEvent } from "./ob-types.js";

// ── Test data ────────────────────────────────────────────────────────

/** Textbook bullish OB: bearish candle at [1] then strong bullish move at [2]. */
const BULLISH_OB_BARS: readonly Bar[] = [
  { o: 100, h: 102, l: 99, c: 101 }, // 0 — neutral
  { o: 103, h: 104, l: 100, c: 100.5 }, // 1 — bearish candle (OB candidate)
  { o: 101, h: 112, l: 100, c: 111 }, // 2 — strong bullish displacement
  { o: 111, h: 113, l: 110, c: 112 }, // 3
];

/** Textbook bearish OB: bullish candle at [1] then strong bearish move at [2]. */
const BEARISH_OB_BARS: readonly Bar[] = [
  { o: 110, h: 112, l: 109, c: 110 }, // 0 — doji (skipped)
  { o: 108, h: 112, l: 107, c: 111 }, // 1 — bullish candle (OB candidate)
  { o: 110, h: 111, l: 98, c: 99 }, // 2 — strong bearish displacement
  { o: 99, h: 100, l: 97, c: 98 }, // 3
];

/** Bars with no qualifying OB (moves too small). */
const NO_OB_BARS: readonly Bar[] = [
  { o: 100, h: 101, l: 99, c: 100.5 },
  { o: 100.5, h: 101.5, l: 100, c: 100.2 }, // bearish but tiny
  { o: 100.3, h: 101, l: 100, c: 100.8 }, // tiny move
  { o: 100.8, h: 101.2, l: 100.5, c: 101 },
];

/** Longer series for lookahead probe. */
const PROBE_BARS: readonly Bar[] = [
  { o: 100, h: 102, l: 99, c: 101 },
  { o: 101, h: 103, l: 100, c: 102 },
  { o: 104, h: 105, l: 103, c: 103.5 }, // bearish candidate
  { o: 103, h: 114, l: 102, c: 113 }, // big bullish displacement
  { o: 113, h: 115, l: 112, c: 114 },
  { o: 114, h: 115, l: 113, c: 113.5 }, // bearish candidate
  { o: 113, h: 114, l: 112, c: 113.8 }, // small move
  { o: 114, h: 116, l: 113, c: 115 },
  { o: 115, h: 115.5, l: 110, c: 110.5 }, // bearish displacement?
  { o: 110, h: 112, l: 109, c: 111 },
  { o: 111, h: 113, l: 110, c: 112 },
  { o: 112, h: 112.5, l: 111, c: 111.5 },
];

const GHOST_BARS: readonly Bar[] = [
  { o: 111.5, h: 113, l: 111, c: 112.5 },
  { o: 112.5, h: 114, l: 112, c: 113.5 },
  { o: 113.5, h: 115, l: 113, c: 114.5 },
];

// ── Tests ────────────────────────────────────────────────────────────

describe("Order Block Detector", () => {
  // 1. Textbook OB is found
  it("detects a textbook bullish order block", () => {
    const events = detectOb(BULLISH_OB_BARS, 1.0, 3);
    const bullish = events.filter((e) => e.direction === "bullish");
    expect(bullish.length).toBeGreaterThanOrEqual(1);

    const first = bullish[0]!;
    expect(first.type).toBe("ob");
    expect(first.direction).toBe("bullish");
    expect(first.candidateBar).toBe(1);
    expect(first.displacementBar).toBe(2);
    // OB zone is body of bearish candle [1]: open=103, close=100.5
    expect(first.upper).toBe(103);
    expect(first.lower).toBe(100.5);
    expect(first.midpoint).toBeCloseTo(101.75);
  });

  it("detects a textbook bearish order block", () => {
    const events = detectOb(BEARISH_OB_BARS, 1.0, 3);
    const bearish = events.filter((e) => e.direction === "bearish");
    expect(bearish.length).toBeGreaterThanOrEqual(1);

    const first = bearish[0]!;
    expect(first.type).toBe("ob");
    expect(first.direction).toBe("bearish");
    expect(first.candidateBar).toBe(1);
    expect(first.displacementBar).toBe(2);
    // OB zone is body of bullish candle [1]: open=108, close=111
    expect(first.upper).toBe(111);
    expect(first.lower).toBe(108);
    expect(first.midpoint).toBeCloseTo(109.5);
  });

  // 2. Boundary rejection
  it("rejects OBs where displacement is below threshold", () => {
    const events = detectOb(NO_OB_BARS, 5.0, 3);
    expect(events.length).toBe(0);
  });

  it("admits an OB that meets the displacement threshold", () => {
    // Use a low threshold to admit the bullish OB
    const events = detectOb(BULLISH_OB_BARS, 0.1, 3);
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  // 3. Maturity index
  it("maturity index always equals displacement bar index", () => {
    const events = detectOb(BULLISH_OB_BARS, 0.5, 3);
    for (const e of events) {
      expect(e.maturityIndex).toBe(e.displacementBar);
      expect(e.maturityIndex).toBeGreaterThan(e.candidateBar);
    }
  });

  // 4. Later price action doesn't change detection
  it("still detects OB at formation even if later bars retrace through it", () => {
    const barsWithRetrace: readonly Bar[] = [
      ...BULLISH_OB_BARS,
      { o: 112, h: 113, l: 99, c: 100 }, // retraces through OB zone
    ];
    const events = detectOb(barsWithRetrace, 1.0, 3);
    const obAt1 = events.find((e) => e.candidateBar === 1);
    expect(obAt1).toBeDefined();
    expect(obAt1!.displacementBar).toBe(2);
  });

  // 5. Lookahead probe
  describe("Lookahead probe", () => {
    it("labels over shared region are identical with and without future bars", () => {
      const minDisp = 1.0;
      const atrPeriod = 3;

      const baseEvents = detectOb(PROBE_BARS, minDisp, atrPeriod);
      const extendedBars = [...PROBE_BARS, ...GHOST_BARS];
      const extendedEvents = detectOb(extendedBars, minDisp, atrPeriod);

      // Filter to shared region only
      const sharedEvents = extendedEvents.filter((e) => e.displacementBar < PROBE_BARS.length);

      const key = (events: readonly ObEvent[]) =>
        events
          .map(
            (e) =>
              `${e.candidateBar}:${e.displacementBar}:${e.direction}:${e.upper.toFixed(3)}:${e.lower.toFixed(3)}`,
          )
          .join("|");

      expect(key(baseEvents)).toBe(key(sharedEvents));
    });

    it("probe passes with different threshold values", () => {
      for (const mult of [0.1, 0.5, 1.0, 1.5, 2.0]) {
        const base = detectOb(PROBE_BARS, mult, 3);
        const extended = detectOb([...PROBE_BARS, ...GHOST_BARS], mult, 3);
        const shared = extended.filter((e) => e.displacementBar < PROBE_BARS.length);

        const key = (events: readonly ObEvent[]) =>
          events
            .map(
              (e) =>
                `${e.candidateBar}:${e.displacementBar}:${e.direction}:${e.upper.toFixed(3)}:${e.lower.toFixed(3)}`,
            )
            .join("|");

        expect(key(base)).toBe(key(shared));
      }
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  it("returns empty array for fewer than 2 bars", () => {
    expect(detectOb([], 1.0, 3)).toEqual([]);
    expect(detectOb([{ o: 100, h: 101, l: 99, c: 100 }], 1.0, 3)).toEqual([]);
  });

  it("skips doji candles (open === close)", () => {
    const bars: readonly Bar[] = [
      { o: 100, h: 102, l: 98, c: 100 }, // doji — skipped
      { o: 100, h: 110, l: 99, c: 109 }, // big bullish
    ];
    // Doji shouldn't produce an OB
    const events = detectOb(bars, 0.1, 3);
    expect(events.length).toBe(0);
  });

  it("event fields match expected shape", () => {
    const events = detectOb(BULLISH_OB_BARS, 0.5, 3);
    for (const e of events) {
      expect(e.type).toBe("ob");
      expect(["bullish", "bearish"]).toContain(e.direction);
      expect(e.candidateBar).toBeGreaterThanOrEqual(0);
      expect(e.displacementBar).toBeGreaterThan(e.candidateBar);
      expect(e.upper).toBeGreaterThan(e.lower);
      expect(e.midpoint).toBeCloseTo((e.upper + e.lower) / 2);
      expect(e.displacementAtr).toBeGreaterThan(0);
      expect(e.maturityIndex).toBe(e.displacementBar);
    }
  });
});
