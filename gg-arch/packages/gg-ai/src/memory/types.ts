import { z } from "zod";

// ─── Org Context (Bounded Memory) ───────────────────────────────

export const OrgContextSchema = z.object({
  organisation: z.object({
    name: z.string(),
    abbreviation: z.string(),
  }),
  strategy: z.object({
    pillars: z.array(z.string()),
    principles: z.array(z.string()),
  }),
  governance: z.object({
    review_body: z.string(),
    submission_format: z.string(),
    review_criteria: z.array(z.string()),
    known_biases: z.array(z.string()),
  }),
  team: z.object({
    name: z.string(),
    parent: z.string(),
    key_stakeholders: z.array(z.object({
      name: z.string(),
      role: z.string(),
      domain: z.string(),
    })),
  }),
  platform: z.object({
    identity: z.string(),
    cloud: z.string(),
    productivity: z.string(),
    integrations: z.array(z.string()),
  }),
});

export type OrgContext = z.infer<typeof OrgContextSchema>;

// ─── Decision Records (Precedent Memory) ────────────────────────

export const DecisionOutcomeSchema = z.object({
  status: z.enum(["approved", "approved_with_conditions", "sent_back", "rejected", "pending"]),
  date: z.string().nullable(),
  notes: z.string(),
});

export const DecisionRecordSchema = z.object({
  id: z.string(),
  date: z.string(),
  title: z.string(),
  context_summary: z.string(),
  tensions: z.array(z.object({
    label: z.string(),
    resolution: z.string(),
    tradeoff_accepted: z.string(),
  })),
  objections: z.array(z.object({
    reviewer_type: z.string(),
    concern: z.string(),
    response: z.string(),
    status: z.enum(["resolved", "accepted_risk", "deferred"]),
  })),
  reasoning_trace: z.string(),
  outcome: DecisionOutcomeSchema.nullable(),
  tags: z.array(z.string()),
});

export const DecisionStoreSchema = z.object({
  decisions: z.array(DecisionRecordSchema),
});

export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;
export type DecisionOutcome = z.infer<typeof DecisionOutcomeSchema>;
export type DecisionStore = z.infer<typeof DecisionStoreSchema>;

// ─── Learned Patterns (Organisational Memory) ───────────────────

export const PatternSchema = z.object({
  pattern: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  evidence_count: z.number(),
  first_seen: z.string(),
  last_seen: z.string(),
});

export const PatternStoreSchema = z.object({
  reviewer_patterns: z.array(PatternSchema.extend({
    reviewer_type: z.string(),
  })),
  framing_patterns: z.array(PatternSchema),
  governance_patterns: z.array(PatternSchema),
});

export type Pattern = z.infer<typeof PatternSchema>;
export type PatternStore = z.infer<typeof PatternStoreSchema>;
