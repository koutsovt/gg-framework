import type { Tension, Persona, Review } from "../schemas.js";

export interface ReviewWithResponse {
  persona: string;
  review: Review;
  architect_response: string;
}

export function recordPrompt(
  context: string,
  tensions: Tension[],
  reviewsWithResponses: ReviewWithResponse[]
): string {
  const today = new Date().toISOString().split("T")[0];

  return `Synthesise the entire adversarial review into a structured decision record. This record should capture the full reasoning trace — the part that would otherwise live only in the architect's head.

ORIGINAL CONTEXT:
${context}

TENSIONS IDENTIFIED:
${JSON.stringify(tensions, null, 2)}

REVIEWER CRITIQUES AND ARCHITECT RESPONSES:
${JSON.stringify(reviewsWithResponses, null, 2)}

Produce a decision record. Respond with ONLY a JSON object:
{
  "decision_title": "Short title for the decision",
  "decision_date": "${today}",
  "summary": "2-3 sentence summary of the decision and outcome",
  "tensions_navigated": [
    {
      "tension": "Label",
      "resolution": "How it was resolved or accepted",
      "tradeoff_accepted": "What was given up"
    }
  ],
  "objections_addressed": [
    {
      "reviewer": "Persona name",
      "objection": "Their key concern",
      "response": "How it was addressed",
      "status": "resolved" | "accepted_risk" | "deferred"
    }
  ],
  "conditions_for_success": ["condition1", "condition2"],
  "open_risks": ["risk1", "risk2"],
  "reasoning_trace": "A narrative paragraph capturing WHY this decision was made the way it was — the reasoning that would otherwise be lost. Write this as if explaining to a future architect who inherits this decision and needs to understand not just what was decided, but why, and what alternatives were considered and rejected."
}`;
}
