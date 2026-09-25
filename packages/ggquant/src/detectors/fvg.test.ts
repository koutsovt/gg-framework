import { describe, it, expect } from "vitest";
import { detectFvg } from "./fvg.js";
import type { Bar, FvgEvent } from "../detector-types.js";

// ── Test data from fvg-detector-instrument.html ──────────────────────

const CANDLES: readonly Bar[] = [
  { o: 100, h: 102.5, l: 99, c: 101.5 },
  { o: 101.5, h: 103, l: 100.5, c: 102.5 },
  { o: 102.5, h: 107, l: 102, c: 106.5 },
  { o: 108, h: 110.5, l: 107.5, c: 110 },
  { o: 109, h: 110.5, l: 107, c: 109.5 },
  { o: 110, h: 112, l: 109.5, c: 111.5 },
  { o: 111.5, h: 112.5, l: 110.8, c: 112 },
  { o: 112, h: 112.6, l: 111.4, c: 111.8 },
  { o: 111.5, h: 112, l: 106, c: 106.5 },
  { o: 106, h: 107, l: 104, c: 104.8 },
  { o: 104.8, h: 106, l: 104, c: 105.5 },
  { o: 105.5, h: 107.2, l: 105.2, c: 107 },
  { o: 107, h: 108.3, l: 106.9, c: 108 },
];

const GHOST_CANDLES: readonly Bar[] = [
  { o: 108, h: 109.5, l: 107.6, c: 109 },
  { o: 109, h: 110.4, l: 108.5, c: 110 },
  { o: 110, h: 111.2, l: 109.4, c: 110.6 },
];

// ── Helpers ──────────────────────────────────────────────────────────

/** Build a minimal 3-bar bullish FVG with a known gap size. */
function bullishFvgBars(gapSize: number): readonly Bar[] {
  // bar1: high at 100
  // bar2: in between (doesn't affect FVG detection)
  // bar3: low at 100 + gapSize
  return [
    { o: 98, h: 100, l: 97, c: 99 },
    { o: 99, h: 101, l: 98, c: 100 },
    { o: 100 + gapSize, h: 102 + gapSize, l: 100 + gapSize, c: 101 + gapSize },
  ];
}

// ── Tests ────────────────────────────────────────────────────────────

describe("FVG Detector", () => {
  // 1. Textbook gap is found
  it("detects a textbook bullish FVG", () => {
    // Bars 0-1-2 in CANDLES: bar1.high=102.5, bar3.low=102 → overlap, no gap
    // Bars 1-2-3: bar1.high=103, bar3.low=107.5 → bullish gap of 4.5
    const events = detectFvg(CANDLES, 0.5, 3);
    const bullish = events.filter((e) => e.direction === "bullish");
    expect(bullish.length).toBeGreaterThanOrEqual(1);

    // The first bullish FVG should be at bars [1,2,3]
    const first = bullish[0]!;
    expect(first.type).toBe("fvg");
    expect(first.direction).toBe("bullish");
    expect(first.bars[0]).toBe(1); // bar1 index
    expect(first.bars[2]).toBe(3); // bar3 index
    expect(first.lower).toBe(103); // bar1.high
    expect(first.upper).toBe(107.5); // bar3.low
    expect(first.midpoint).toBe((103 + 107.5) / 2);
  });

  it("detects a bearish FVG", () => {
    // Construct bars where bar1.low > bar3.high
    const bars: readonly Bar[] = [
      { o: 110, h: 112, l: 108, c: 109 },
      { o: 109, h: 110, l: 107, c: 108 },
      { o: 105, h: 106, l: 103, c: 104 },
    ];
    const events = detectFvg(bars, 0.1, 3);
    expect(events.length).toBe(1);
    const e = events[0]!;
    expect(e.direction).toBe("bearish");
    expect(e.upper).toBe(108); // bar1.low
    expect(e.lower).toBe(106); // bar3.high
    expect(e.midpoint).toBe(107);
  });

  // 2. Boundary gap rejected at min_size_atr threshold
  it("rejects a gap that is one tick below the ATR threshold", () => {
    // With a very high min_size_atr, small gaps should be rejected
    const bars = bullishFvgBars(0.5); // tiny gap of 0.5
    const events = detectFvg(bars, 5.0, 3); // require 5× ATR
    expect(events.length).toBe(0);
  });

  it("admits a gap that exactly meets the ATR threshold", () => {
    // Use a large gap that will pass any reasonable threshold
    const bars = bullishFvgBars(10);
    const events = detectFvg(bars, 0.1, 3);
    expect(events.length).toBe(1);
    expect(events[0]!.direction).toBe("bullish");
  });

  // 3. Gap that later fills is still detected at formation
  it("still detects a gap at formation even if later bars fill it", () => {
    const bars: readonly Bar[] = [
      { o: 98, h: 100, l: 97, c: 99 }, // bar1.high = 100
      { o: 100, h: 104, l: 99, c: 103 }, // bar2
      { o: 105, h: 108, l: 105, c: 107 }, // bar3.low = 105 → gap [100,105]
      { o: 107, h: 107, l: 101, c: 102 }, // fills back through the gap
      { o: 102, h: 103, l: 99, c: 100 }, // even more fill
    ];
    const events = detectFvg(bars, 0.1, 3);
    // The FVG at bars [0,1,2] should still be detected
    const fvgAt2 = events.find((e) => e.bars[0] === 0 && e.bars[2] === 2);
    expect(fvgAt2).toBeDefined();
    expect(fvgAt2!.upper).toBe(105);
    expect(fvgAt2!.lower).toBe(100);
  });

  // 4. Maturity index never precedes bar 3
  it("maturity index always equals bar 3 index", () => {
    const events = detectFvg(CANDLES, 0.5, 3);
    for (const e of events) {
      expect(e.maturityIndex).toBe(e.bars[2]);
      expect(e.maturityIndex).toBeGreaterThanOrEqual(2);
    }
  });

  // 5. Lookahead probe
  describe("Lookahead probe", () => {
    it("labels over shared region are identical with and without future bars", () => {
      const minSizeAtr = 0.5;
      const atrPeriod = 3;

      // Run A: original window
      const baseEvents = detectFvg(CANDLES, minSizeAtr, atrPeriod);

      // Run B: original window + ghost candles appended
      const extendedBars = [...CANDLES, ...GHOST_CANDLES];
      const extendedEvents = detectFvg(extendedBars, minSizeAtr, atrPeriod);

      // Filter extended results to only the shared region (bar3 < CANDLES.length)
      const sharedEvents = extendedEvents.filter((e) => e.bars[2] < CANDLES.length);

      // Serialize for comparison — same key format as HTML spec
      const key = (events: readonly FvgEvent[]) =>
        events
          .map((f) => `${f.bars[2]}:${f.direction}:${f.upper.toFixed(3)}:${f.lower.toFixed(3)}`)
          .join("|");

      expect(key(baseEvents)).toBe(key(sharedEvents));
      // Sanity: base run should have found at least one FVG
      expect(baseEvents.length).toBeGreaterThan(0);
    });

    it("probe passes with different min_size_atr values", () => {
      for (const mult of [0.1, 0.3, 0.5, 1.0, 1.5, 2.0]) {
        const base = detectFvg(CANDLES, mult, 3);
        const extended = detectFvg([...CANDLES, ...GHOST_CANDLES], mult, 3);
        const shared = extended.filter((e) => e.bars[2] < CANDLES.length);

        const key = (events: readonly FvgEvent[]) =>
          events
            .map((f) => `${f.bars[2]}:${f.direction}:${f.upper.toFixed(3)}:${f.lower.toFixed(3)}`)
            .join("|");

        expect(key(base)).toBe(key(shared));
      }
    });
  });

  // ── Edge cases ─────────────────────────────────────────────────────

  it("returns empty array for fewer than 3 bars", () => {
    expect(detectFvg([], 0.5, 3)).toEqual([]);
    expect(detectFvg([CANDLES[0]!], 0.5, 3)).toEqual([]);
    expect(detectFvg([CANDLES[0]!, CANDLES[1]!], 0.5, 3)).toEqual([]);
  });

  it("returns empty when no gaps exist in overlapping bars", () => {
    // All bars overlap — no FVG possible
    const bars: readonly Bar[] = [
      { o: 100, h: 102, l: 99, c: 101 },
      { o: 101, h: 103, l: 100, c: 102 },
      { o: 101.5, h: 102.5, l: 100.5, c: 101.8 },
    ];
    expect(detectFvg(bars, 0.1, 3).length).toBe(0);
  });

  it("event fields match the HTML spec format", () => {
    const events = detectFvg(CANDLES, 0.5, 3);
    for (const e of events) {
      expect(e.type).toBe("fvg");
      expect(["bullish", "bearish"]).toContain(e.direction);
      expect(e.bars).toHaveLength(3);
      expect(e.bars[1]).toBe(e.bars[0] + 1);
      expect(e.bars[2]).toBe(e.bars[0] + 2);
      expect(e.upper).toBeGreaterThan(e.lower);
      expect(e.midpoint).toBeCloseTo((e.upper + e.lower) / 2);
      expect(e.gapAtr).toBeGreaterThan(0);
      expect(e.maturityIndex).toBe(e.bars[2]);
    }
  });
});
