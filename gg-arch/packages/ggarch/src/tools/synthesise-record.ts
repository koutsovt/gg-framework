import { callLlm } from "@gg-arch/agent";
import {
  SynthesisedRecordSchema,
  type SynthesisedRecord,
  type Tension,
  type Persona,
  type Review,
} from "../schemas.js";
import { recordPrompt, type ReviewWithResponse } from "../prompts/record.js";

export async function synthesiseRecord(
  context: string,
  tensions: Tension[],
  personas: Persona[],
  reviews: Record<string, Review>,
  responses: Record<string, string>
): Promise<SynthesisedRecord> {
  const reviewsWithResponses: ReviewWithResponse[] = personas.map((p) => ({
    persona: p.name,
    review: reviews[p.id],
    architect_response: responses[p.id] || "",
  }));

  return callLlm(
    recordPrompt(context, tensions, reviewsWithResponses),
    SynthesisedRecordSchema
  );
}
