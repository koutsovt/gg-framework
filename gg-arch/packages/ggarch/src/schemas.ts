import { z } from "zod";

// ─── Tension Extraction ─────────────────────────────────────────

export const TensionSchema = z.object({
  id: z.string(),
  label: z.string(),
  pole_a: z.string(),
  pole_b: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  description: z.string(),
});

export const TensionMapSchema = z.object({
  tensions: z.array(TensionSchema),
  summary: z.string(),
});

export type Tension = z.infer<typeof TensionSchema>;
export type TensionMap = z.infer<typeof TensionMapSchema>;

// ─── Persona Generation ─────────────────────────────────────────

export const PersonaSchema = z.object({
  id: z.string(),
  name: z.string(),
  perspective: z.string(),
  background: z.string(),
  likely_concerns: z.array(z.string()),
  communication_style: z.string(),
  relevant_tensions: z.array(z.string()),
});

export const PersonaListSchema = z.object({
  personas: z.array(PersonaSchema),
});

export type Persona = z.infer<typeof PersonaSchema>;

// ─── Adversarial Review ─────────────────────────────────────────

export const ReviewSchema = z.object({
  verdict: z.enum(["approve", "approve_with_conditions", "request_changes", "reject"]),
  confidence: z.enum(["high", "medium", "low"]),
  key_concern: z.string(),
  detailed_feedback: z.string(),
  questions: z.array(z.string()),
  conditions: z.array(z.string()),
});

export type Review = z.infer<typeof ReviewSchema>;

// ─── Decision Record Synthesis ──────────────────────────────────

export const SynthesisedRecordSchema = z.object({
  decision_title: z.string(),
  decision_date: z.string(),
  summary: z.string(),
  tensions_navigated: z.array(z.object({
    tension: z.string(),
    resolution: z.string(),
    tradeoff_accepted: z.string(),
  })),
  objections_addressed: z.array(z.object({
    reviewer: z.string(),
    objection: z.string(),
    response: z.string(),
    status: z.enum(["resolved", "accepted_risk", "deferred"]),
  })),
  conditions_for_success: z.array(z.string()),
  open_risks: z.array(z.string()),
  reasoning_trace: z.string(),
});

export type SynthesisedRecord = z.infer<typeof SynthesisedRecordSchema>;

// ─── Narrative Testing ──────────────────────────────────────────

export const NarrativeAssessmentSchema = z.object({
  effectiveness: z.enum(["strong", "adequate", "weak"]),
  resonates_with: z.array(z.string()),
  gaps: z.array(z.string()),
  suggested_reframe: z.string(),
  reasoning: z.string(),
});

export type NarrativeAssessment = z.infer<typeof NarrativeAssessmentSchema>;

// ─── Stakeholder Extraction ─────────────────────────────────────

export const StakeholderSchema = z.object({
  name: z.string(),
  role: z.string(),
  influence: z.enum(["high", "medium", "low"]),
  interest: z.enum(["high", "medium", "low"]),
  likely_stance: z.string(),
  key_concern: z.string(),
});

export const StakeholderMapSchema = z.object({
  stakeholders: z.array(StakeholderSchema),
  summary: z.string(),
});

export type Stakeholder = z.infer<typeof StakeholderSchema>;
export type StakeholderMap = z.infer<typeof StakeholderMapSchema>;

// ─── Precedent Comparison ───────────────────────────────────────

export const PrecedentComparisonSchema = z.object({
  similar_decisions: z.array(z.object({
    decision_id: z.string(),
    decision_title: z.string(),
    similarity: z.string(),
    relevant_lesson: z.string(),
  })),
  recommendations: z.array(z.string()),
});

export type PrecedentComparison = z.infer<typeof PrecedentComparisonSchema>;

// ─── Session State ──────────────────────────────────────────────

export interface SessionState {
  context: string;
  tensions: TensionMap | null;
  personas: Persona[];
  reviews: Record<string, Review>;
  responses: Record<string, string>;
  record: SynthesisedRecord | null;
}

export function createEmptySession(): SessionState {
  return {
    context: "",
    tensions: null,
    personas: [],
    reviews: {},
    responses: {},
    record: null,
  };
}
