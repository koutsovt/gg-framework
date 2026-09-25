// ──────────────────────────────────────────────────────────────────────
// ggquant — ggarch DecisionStore adapter
// Maps ggquant DecisionRecords to ggarch's file-based decision store
// at ~/.gg-arch/decisions.json. Compatible with ggarch's schema without
// requiring a cross-repo dependency.
// ──────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { DecisionStore, DecisionRecord } from "./decision-log.js";

const CONFIG_DIR = join(homedir(), ".gg-arch");
const DECISIONS_FILE = join(CONFIG_DIR, "decisions.json");

/**
 * A ggarch-format decision record.
 * Mirrors the schema in gg-arch/packages/gg-ai/src/memory/types.ts.
 */
interface GgarchDecisionRecord {
  id: string;
  date: string;
  title: string;
  context_summary: string;
  tensions: {
    label: string;
    resolution: string;
    tradeoff_accepted: string;
  }[];
  objections: {
    reviewer_type: string;
    concern: string;
    response: string;
    status: "resolved" | "accepted_risk" | "deferred";
  }[];
  reasoning_trace: string;
  outcome: {
    status: "approved" | "approved_with_conditions" | "sent_back" | "rejected" | "pending";
    date: string | null;
    notes: string;
  } | null;
  tags: string[];
}

interface GgarchDecisionStoreData {
  decisions: GgarchDecisionRecord[];
}

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadDecisions(): GgarchDecisionStoreData {
  ensureDir();
  if (!existsSync(DECISIONS_FILE)) return { decisions: [] };
  try {
    return JSON.parse(readFileSync(DECISIONS_FILE, "utf-8")) as GgarchDecisionStoreData;
  } catch {
    return { decisions: [] };
  }
}

function saveDecisions(data: GgarchDecisionStoreData): void {
  ensureDir();
  writeFileSync(DECISIONS_FILE, JSON.stringify(data, null, 2), "utf-8");
}

/** Generate a unique ID for a ggarch decision record. */
function generateId(record: DecisionRecord): string {
  const date = record.timestamp.split("T")[0]!.replace(/-/g, "");
  const kindShort =
    record.kind === "setup-compiled" ? "SC" : record.kind === "parameter-chosen" ? "PC" : "HV";
  const subjectSlug = record.subject.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 30);
  return `ggquant-${kindShort}-${date}-${subjectSlug}`;
}

/** Map a ggquant DecisionRecord to ggarch's format. */
function toGgarch(record: DecisionRecord): GgarchDecisionRecord {
  const date = record.timestamp.split("T")[0]!;

  const titleMap: Record<string, string> = {
    "setup-compiled": `Setup compiled: ${record.subject}`,
    "parameter-chosen": `Parameter chosen: ${(record.payload as Record<string, unknown>)["paramName"]} for ${record.subject}`,
    "harness-verdict": `Harness verdict: ${(record.payload as Record<string, unknown>)["recommendation"]} — ${record.subject}`,
  };

  return {
    id: generateId(record),
    date,
    title: titleMap[record.kind] ?? `ggquant: ${record.kind}`,
    context_summary: record.rationale,
    tensions: [],
    objections: [],
    reasoning_trace: JSON.stringify(record.payload),
    outcome:
      record.kind === "harness-verdict"
        ? {
            status:
              (record.payload as Record<string, unknown>)["recommendation"] === "promote"
                ? "approved"
                : "rejected",
            date,
            notes: record.rationale,
          }
        : null,
    tags: ["ggquant", record.kind, record.subject],
  };
}

/**
 * DecisionStore implementation that writes to ggarch's
 * ~/.gg-arch/decisions.json file, compatible with ggarch's CLI.
 */
export class GgarchStore implements DecisionStore {
  private inMemory: DecisionRecord[] = [];

  append(record: DecisionRecord): void {
    this.inMemory.push(record);

    const store = loadDecisions();
    const ggarchRecord = toGgarch(record);

    // Upsert by id (same logic as ggarch's saveDecision)
    const existingIdx = store.decisions.findIndex((d) => d.id === ggarchRecord.id);
    if (existingIdx >= 0) {
      store.decisions[existingIdx] = ggarchRecord;
    } else {
      store.decisions.push(ggarchRecord);
    }

    saveDecisions(store);
  }

  list(): readonly DecisionRecord[] {
    return this.inMemory;
  }
}
