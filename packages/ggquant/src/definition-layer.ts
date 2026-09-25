// ──────────────────────────────────────────────────────────────────────
// ggquant — Definition Layer compiler (Stage 01)
// SPEC.md §2: compile-or-reject validator.
// ──────────────────────────────────────────────────────────────────────

import type { Setup, CompileResult, Rejection, TargetLevel } from "./types.js";

// ── Banned lexicon (intentionally dumb — the friction is the feature) ─

const BANNED_WORDS: readonly string[] = [
  "strong",
  "clean",
  "significant",
  "obvious",
  "clear",
  "quality",
  "looks",
];

// ── Underspecified reference patterns ────────────────────────────────

const UNDERSPECIFIED_PATTERNS: readonly RegExp[] = [
  /\bthe\s+killzone\b/i,
  /\bthe\s+swing\s+high\b/i,
  /\bthe\s+swing\s+low\b/i,
  /\bthe\s+recent\s+(high|low)\b/i,
  /\bthe\s+key\s+level\b/i,
  /\bthe\s+zone\b/i,
  /\bnearby\s+level\b/i,
  /\bimportant\s+level\b/i,
];

// ── Helpers ──────────────────────────────────────────────────────────

function scanForDiscretionWords(value: unknown, path: string, out: Rejection[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    for (const word of BANNED_WORDS) {
      // Word-boundary match to avoid false positives inside other words
      const re = new RegExp(`\\b${word}\\b`, "i");
      if (re.test(lower)) {
        out.push({
          rule: "discretion_word",
          message: `Banned discretion word "${word}" found in ${path}`,
          path,
          word,
        });
      }
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      scanForDiscretionWords(child, `${path}.${key}`, out);
    }
  }
}

function scanForUnderspecifiedRefs(value: unknown, path: string, out: Rejection[]): void {
  if (typeof value === "string") {
    for (const pattern of UNDERSPECIFIED_PATTERNS) {
      if (pattern.test(value)) {
        const match = value.match(pattern);
        out.push({
          rule: "underspecified_reference",
          message: `Underspecified reference "${match?.[0]}" in ${path} — must resolve to a computed value`,
          path,
        });
      }
    }
  } else if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      scanForUnderspecifiedRefs(child, `${path}.${key}`, out);
    }
  }
}

// ── Rule 1: Unbound parameter ────────────────────────────────────────

function checkUnboundParams(setup: Setup): Rejection[] {
  const out: Rejection[] = [];
  const params = setup.detection.params;

  if (Object.keys(params).length === 0) {
    out.push({
      rule: "unbound_parameter",
      message: "Detection block has no parameters — every detector requires explicit parameters",
      path: "detection.params",
    });
  }

  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null) {
      out.push({
        rule: "unbound_parameter",
        message: `Parameter "${key}" is unbound (undefined/null)`,
        path: `detection.params.${key}`,
      });
    }
    // Detect range-like strings: "0.3-0.7", "0.3..0.7", "0.3 to 0.7"
    if (typeof val === "string" && /\d+\s*[-–.]{1,2}\s*\d+|\d+\s+to\s+\d+/i.test(val)) {
      out.push({
        rule: "unbound_parameter",
        message: `Parameter "${key}" looks like a range ("${val}") — commit to a single value`,
        path: `detection.params.${key}`,
      });
    }
  }

  return out;
}

// ── Rule 2: Discretion words ─────────────────────────────────────────

function checkDiscretionWords(setup: Setup): Rejection[] {
  const out: Rejection[] = [];
  scanForDiscretionWords(setup, "setup", out);
  return out;
}

// ── Rule 3: Underspecified references ────────────────────────────────

function checkUnderspecifiedRefs(setup: Setup): Rejection[] {
  const out: Rejection[] = [];
  scanForUnderspecifiedRefs(setup, "setup", out);
  return out;
}

// ── Rule 4: Missing / unreachable invalidation ──────────────────────

function checkInvalidation(setup: Setup): Rejection[] {
  const out: Rejection[] = [];

  // 4a. Missing invalidation block — structurally enforced by the type,
  // but we also check at runtime for partial objects.
  if (!setup.invalidation) {
    out.push({
      rule: "missing_invalidation",
      message: "Setup has no invalidation block — every setup requires one",
      path: "invalidation",
    });
    return out;
  }

  // 4b. Time-stop must be positive
  if (setup.invalidation.timeStopBars <= 0) {
    out.push({
      rule: "missing_invalidation",
      message: `timeStopBars must be positive (got ${setup.invalidation.timeStopBars})`,
      path: "invalidation.timeStopBars",
    });
  }

  // 4c. Target must have at least one level
  if (setup.target.levels.length === 0) {
    out.push({
      rule: "missing_invalidation",
      message: "Target has no levels — at least one exit level is required",
      path: "target.levels",
    });
  }

  // 4d. For R-multiple targets: target R must be reachable before invalidation.
  // A target at R < 0 means it's behind the stop — unreachable.
  for (let i = 0; i < setup.target.levels.length; i++) {
    const level: TargetLevel = setup.target.levels[i]!;
    if (level.kind === "r_multiple" && level.value <= 0) {
      out.push({
        rule: "missing_invalidation",
        message: `Target level ${i} has R multiple ≤ 0 (${level.value}) — unreachable before invalidation`,
        path: `target.levels[${i}]`,
      });
    }
    if (level.kind === "partial_scale") {
      for (let j = 0; j < level.levels.length; j++) {
        const partial = level.levels[j]!;
        if (partial.rMultiple <= 0) {
          out.push({
            rule: "missing_invalidation",
            message: `Partial scale level ${j} has R multiple ≤ 0 (${partial.rMultiple}) — unreachable`,
            path: `target.levels[${i}].levels[${j}]`,
          });
        }
      }
    }
  }

  return out;
}

// ── Public API ───────────────────────────────────────────────────────

/** Compile a Setup: returns a CompiledSetup or a list of Rejections. */
export function compileSetup(setup: Setup): CompileResult {
  const rejections: Rejection[] = [
    ...checkUnboundParams(setup),
    ...checkDiscretionWords(setup),
    ...checkUnderspecifiedRefs(setup),
    ...checkInvalidation(setup),
  ];

  if (rejections.length > 0) {
    return { _tag: "Rejected", rejections };
  }

  return { _tag: "CompiledSetup", setup };
}
