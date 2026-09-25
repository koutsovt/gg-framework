import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  OrgContextSchema,
  DecisionStoreSchema,
  PatternStoreSchema,
  type OrgContext,
  type DecisionStore,
  type DecisionRecord,
  type DecisionOutcome,
  type PatternStore,
} from "./types.js";

const CONFIG_DIR = join(homedir(), ".gg-arch");

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function readJson<T>(filename: string, schema: { parse: (data: unknown) => T }, fallback: T): T {
  ensureConfigDir();
  const filepath = join(CONFIG_DIR, filename);
  if (!existsSync(filepath)) return fallback;
  try {
    const raw = JSON.parse(readFileSync(filepath, "utf-8"));
    return schema.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filename: string, data: unknown): void {
  ensureConfigDir();
  const filepath = join(CONFIG_DIR, filename);
  writeFileSync(filepath, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Org Context ────────────────────────────────────────────────

const DEFAULT_ORG_CONTEXT: OrgContext = {
  organisation: { name: "", abbreviation: "" },
  strategy: { pillars: [], principles: [] },
  governance: {
    review_body: "",
    submission_format: "",
    review_criteria: [],
    known_biases: [],
  },
  team: { name: "", parent: "", key_stakeholders: [] },
  platform: { identity: "", cloud: "", productivity: "", integrations: [] },
};

export function loadOrgContext(): OrgContext {
  return readJson("org-context.json", OrgContextSchema, DEFAULT_ORG_CONTEXT);
}

export function saveOrgContext(context: OrgContext): void {
  writeJson("org-context.json", context);
}

export function isOrgContextConfigured(): boolean {
  const ctx = loadOrgContext();
  return ctx.organisation.name.length > 0;
}

// ─── Decisions ──────────────────────────────────────────────────

const EMPTY_DECISIONS: DecisionStore = { decisions: [] };

export function loadDecisions(): DecisionStore {
  return readJson("decisions.json", DecisionStoreSchema, EMPTY_DECISIONS);
}

export function saveDecision(record: DecisionRecord): void {
  const store = loadDecisions();
  const existingIdx = store.decisions.findIndex((d) => d.id === record.id);
  if (existingIdx >= 0) {
    store.decisions[existingIdx] = record;
  } else {
    store.decisions.push(record);
  }
  writeJson("decisions.json", store);
}

export function findDecision(id: string): DecisionRecord | undefined {
  const store = loadDecisions();
  return store.decisions.find((d) => d.id === id);
}

export function updateDecisionOutcome(id: string, outcome: DecisionOutcome): boolean {
  const store = loadDecisions();
  const decision = store.decisions.find((d) => d.id === id);
  if (!decision) return false;
  decision.outcome = outcome;
  writeJson("decisions.json", store);
  return true;
}

export function searchDecisions(query: string): DecisionRecord[] {
  const store = loadDecisions();
  const q = query.toLowerCase();
  return store.decisions.filter(
    (d) =>
      d.title.toLowerCase().includes(q) ||
      d.context_summary.toLowerCase().includes(q) ||
      d.tags.some((t) => t.toLowerCase().includes(q)) ||
      d.reasoning_trace.toLowerCase().includes(q)
  );
}

export function recentDecisions(n: number = 5): DecisionRecord[] {
  const store = loadDecisions();
  return store.decisions
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
}

// ─── Patterns ───────────────────────────────────────────────────

const EMPTY_PATTERNS: PatternStore = {
  reviewer_patterns: [],
  framing_patterns: [],
  governance_patterns: [],
};

export function loadPatterns(): PatternStore {
  return readJson("patterns.json", PatternStoreSchema, EMPTY_PATTERNS);
}

export function savePatterns(patterns: PatternStore): void {
  writeJson("patterns.json", patterns);
}

export function addReviewerPattern(
  reviewer_type: string,
  pattern: string
): void {
  const store = loadPatterns();
  const existing = store.reviewer_patterns.find(
    (p) => p.reviewer_type === reviewer_type && p.pattern === pattern
  );
  const today = new Date().toISOString().split("T")[0];
  if (existing) {
    existing.evidence_count += 1;
    existing.last_seen = today;
    if (existing.evidence_count >= 3) existing.confidence = "high";
    else if (existing.evidence_count >= 2) existing.confidence = "medium";
  } else {
    store.reviewer_patterns.push({
      reviewer_type,
      pattern,
      confidence: "low",
      evidence_count: 1,
      first_seen: today,
      last_seen: today,
    });
  }
  savePatterns(store);
}

export function addFramingPattern(pattern: string): void {
  const store = loadPatterns();
  const existing = store.framing_patterns.find((p) => p.pattern === pattern);
  const today = new Date().toISOString().split("T")[0];
  if (existing) {
    existing.evidence_count += 1;
    existing.last_seen = today;
  } else {
    store.framing_patterns.push({
      pattern,
      confidence: "low",
      evidence_count: 1,
      first_seen: today,
      last_seen: today,
    });
  }
  savePatterns(store);
}

// ─── Config Dir Path ────────────────────────────────────────────

export function getConfigDir(): string {
  ensureConfigDir();
  return CONFIG_DIR;
}
