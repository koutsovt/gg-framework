import type { Tension } from "../schemas.js";

export function tensionPrompt(context: string): string {
  return `Analyse this architecture decision context and extract the key tensions — competing concerns that the architect must navigate.

CONTEXT:
${context}

Respond with ONLY a JSON object matching this schema:
{
  "tensions": [
    {
      "id": "t1",
      "label": "Short label e.g. Security vs Adoption Speed",
      "pole_a": "One side of the tension",
      "pole_b": "The other side",
      "severity": "high" | "medium" | "low",
      "description": "Why this tension matters for this specific decision"
    }
  ],
  "summary": "One paragraph summarising the overall tension landscape"
}

Extract 4-7 tensions. Be specific to the decision context, not generic. Order by severity descending.`;
}
