import type { Tension, Persona } from "../schemas.js";

export function reviewPrompt(
  context: string,
  tensions: Tension[],
  persona: Persona
): string {
  return `You are now acting as this specific reviewer persona. Review the architecture decision and provide your critique.

DECISION CONTEXT:
${context}

TENSIONS IN PLAY:
${JSON.stringify(tensions, null, 2)}

YOUR PERSONA:
${JSON.stringify(persona, null, 2)}

Stay in character. Be specific and constructive. Reference the actual details of the decision, not generic advice. Your feedback should be the kind that would genuinely improve the architecture submission.

Respond with ONLY a JSON object:
{
  "verdict": "approve" | "approve_with_conditions" | "request_changes" | "reject",
  "confidence": "high" | "medium" | "low",
  "key_concern": "The single most important issue from your perspective",
  "detailed_feedback": "2-3 paragraphs of specific, actionable feedback in character",
  "questions": ["Specific question 1", "Specific question 2"],
  "conditions": ["Condition for approval 1", "Condition 2"]
}`;
}
