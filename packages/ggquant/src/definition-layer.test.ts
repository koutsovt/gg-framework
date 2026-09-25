import { describe, it, expect } from "vitest";
import { compileSetup } from "./definition-layer.js";
import type { Setup, Rejection } from "./types.js";

// ── Helpers ──────────────────────────────────────────────────────────

/** A fully-bound, valid setup that should compile cleanly. */
function validSetup(overrides?: Partial<Setup>): Setup {
  return {
    detection: {
      detector: "fvg",
      params: { min_size_atr: 0.5, atr_period: 3, direction: "bullish" },
    },
    contextFilter: {
      sessionWindow: {
        label: "London",
        startTime: "07:00",
        endTime: "10:00",
        timezone: "Europe/London",
      },
      daysOfWeek: [1, 2, 3, 4, 5],
    },
    entryTrigger: {
      orderType: "limit",
      priceRef: "fvg_midpoint",
    },
    invalidation: {
      priceRef: "fvg_lower",
      offsetPoints: 2,
      timeStopBars: 5,
    },
    target: {
      levels: [{ kind: "r_multiple", value: 2 }],
    },
    positionModel: {
      riskFraction: 0.01,
    },
    metadata: {
      name: "Bullish FVG London",
      version: "1.0.0",
      author: "test",
      thesis:
        "Bullish FVGs during London session on trending days offer a fill-the-gap edge due to institutional order flow.",
    },
    ...overrides,
  };
}

function rejectionRules(rejections: readonly Rejection[]): readonly Rejection["rule"][] {
  return rejections.map((r) => r.rule);
}

// ── Tests ────────────────────────────────────────────────────────────

describe("Definition Layer — compileSetup", () => {
  // ── Valid setup compiles ────────────────────────────────────────────

  it("compiles a fully-bound valid setup", () => {
    const result = compileSetup(validSetup());
    expect(result._tag).toBe("CompiledSetup");
    if (result._tag === "CompiledSetup") {
      expect(result.setup.metadata.name).toBe("Bullish FVG London");
    }
  });

  // ── Rule 1: Unbound parameter ──────────────────────────────────────

  describe("Rule 1 — unbound parameter", () => {
    it("rejects when detection params is empty", () => {
      const result = compileSetup(
        validSetup({
          detection: { detector: "fvg", params: {} },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        expect(rejectionRules(result.rejections)).toContain("unbound_parameter");
      }
    });

    it("rejects a range-like string parameter", () => {
      const result = compileSetup(
        validSetup({
          detection: {
            detector: "fvg",
            params: {
              min_size_atr: "0.3-0.7",
              atr_period: 3,
              direction: "bullish",
            },
          },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        const unbounds = result.rejections.filter((r) => r.rule === "unbound_parameter");
        expect(unbounds.length).toBeGreaterThanOrEqual(1);
        expect(unbounds[0]!.message).toContain("range");
      }
    });
  });

  // ── Rule 2: Discretion words ───────────────────────────────────────

  describe("Rule 2 — discretion word", () => {
    it("rejects a setup with a banned word in the thesis", () => {
      const result = compileSetup(
        validSetup({
          metadata: {
            name: "Test",
            version: "1.0.0",
            author: "test",
            thesis: "This is a strong edge in trending markets",
          },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        const hits = result.rejections.filter((r) => r.rule === "discretion_word");
        expect(hits.length).toBeGreaterThanOrEqual(1);
        expect(hits[0]!.word).toBe("strong");
      }
    });

    it("rejects a setup with a banned word in a detector param", () => {
      const result = compileSetup(
        validSetup({
          detection: {
            detector: "fvg",
            params: {
              min_size_atr: 0.5,
              atr_period: 3,
              direction: "clean bullish",
            },
          },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        const hits = result.rejections.filter((r) => r.rule === "discretion_word");
        expect(hits.length).toBeGreaterThanOrEqual(1);
        expect(hits[0]!.word).toBe("clean");
      }
    });

    it("quotes the offending word in the rejection", () => {
      const result = compileSetup(
        validSetup({
          metadata: {
            name: "Test",
            version: "1.0.0",
            author: "test",
            thesis: "Looks like a gap that fills reliably",
          },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        const hit = result.rejections.find((r) => r.rule === "discretion_word");
        expect(hit).toBeDefined();
        expect(hit!.word).toBe("looks");
        expect(hit!.message).toContain('"looks"');
      }
    });

    it("catches all seven banned words", () => {
      const words = ["strong", "clean", "significant", "obvious", "clear", "quality", "looks"];
      for (const word of words) {
        const result = compileSetup(
          validSetup({
            metadata: {
              name: "Test",
              version: "1.0.0",
              author: "test",
              thesis: `This setup has a ${word} pattern`,
            },
          }),
        );
        expect(result._tag).toBe("Rejected");
        if (result._tag === "Rejected") {
          const hit = result.rejections.find(
            (r) => r.rule === "discretion_word" && r.word === word,
          );
          expect(hit, `Expected rejection for "${word}"`).toBeDefined();
        }
      }
    });
  });

  // ── Rule 3: Underspecified reference ───────────────────────────────

  describe("Rule 3 — underspecified reference", () => {
    it('rejects "the killzone" as an underspecified reference', () => {
      const result = compileSetup(
        validSetup({
          contextFilter: {
            sessionWindow: {
              label: "the killzone",
              startTime: "07:00",
              endTime: "10:00",
              timezone: "Europe/London",
            },
          },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        expect(rejectionRules(result.rejections)).toContain("underspecified_reference");
        expect(result.rejections[0]!.message).toContain("the killzone");
      }
    });

    it('rejects "the swing high" in entry trigger', () => {
      const result = compileSetup(
        validSetup({
          entryTrigger: {
            orderType: "limit",
            priceRef: "the swing high",
          },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        const hits = result.rejections.filter((r) => r.rule === "underspecified_reference");
        expect(hits.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('rejects "the recent low" in invalidation', () => {
      const result = compileSetup(
        validSetup({
          invalidation: {
            priceRef: "the recent low",
            offsetPoints: 2,
            timeStopBars: 5,
          },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        const hits = result.rejections.filter((r) => r.rule === "underspecified_reference");
        expect(hits.length).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // ── Rule 4: Missing / unreachable invalidation ─────────────────────

  describe("Rule 4 — missing / unreachable invalidation", () => {
    it("rejects when invalidation block is missing", () => {
      // Force-remove invalidation at runtime (type says required)
      const setup = validSetup();
      const broken = { ...setup, invalidation: undefined } as unknown as Setup;
      const result = compileSetup(broken);
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        expect(rejectionRules(result.rejections)).toContain("missing_invalidation");
      }
    });

    it("rejects when timeStopBars is zero", () => {
      const result = compileSetup(
        validSetup({
          invalidation: {
            priceRef: "fvg_lower",
            offsetPoints: 2,
            timeStopBars: 0,
          },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        expect(rejectionRules(result.rejections)).toContain("missing_invalidation");
        expect(result.rejections[0]!.message).toContain("timeStopBars");
      }
    });

    it("rejects when target has no levels", () => {
      const result = compileSetup(
        validSetup({
          target: { levels: [] },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        expect(rejectionRules(result.rejections)).toContain("missing_invalidation");
      }
    });

    it("rejects a target with R multiple ≤ 0 (unreachable)", () => {
      const result = compileSetup(
        validSetup({
          target: { levels: [{ kind: "r_multiple", value: -1 }] },
        }),
      );
      expect(result._tag).toBe("Rejected");
      if (result._tag === "Rejected") {
        const hits = result.rejections.filter((r) => r.rule === "missing_invalidation");
        expect(hits.length).toBeGreaterThanOrEqual(1);
        expect(hits[0]!.message).toContain("unreachable");
      }
    });
  });

  // ── Multiple rejections ────────────────────────────────────────────

  it("collects rejections from all rules in one pass", () => {
    const result = compileSetup(
      validSetup({
        detection: { detector: "fvg", params: {} },
        metadata: {
          name: "Test",
          version: "1.0.0",
          author: "test",
          thesis: "A strong obvious edge at the killzone",
        },
        invalidation: {
          priceRef: "fvg_lower",
          offsetPoints: 2,
          timeStopBars: 0,
        },
      }),
    );
    expect(result._tag).toBe("Rejected");
    if (result._tag === "Rejected") {
      const rules = new Set(rejectionRules(result.rejections));
      expect(rules.has("unbound_parameter")).toBe(true);
      expect(rules.has("discretion_word")).toBe(true);
      expect(rules.has("underspecified_reference")).toBe(true);
      expect(rules.has("missing_invalidation")).toBe(true);
    }
  });
});
