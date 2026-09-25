import type { Tension } from "../schemas.js";
import type { DecisionRecord } from "@gg-arch/ai";

export function personaPrompt(
  context: string,
  tensions: Tension[],
  precedents?: DecisionRecord[]
): string {
  let precedentBlock = "";
  if (precedents && precedents.length > 0) {
    const summaries = precedents.map(
      (d) =>
        `- ${d.title}: ${d.objections.map((o) => `${o.reviewer_type} flagged "${o.concern}" (${o.status})`).join("; ")}`
    );
    precedentBlock = `\n\nPAST REVIEW PATTERNS (use to calibrate persona concerns):\n${summaries.join("\n")}`;
  }

  return `Based on this architecture decision context and tension map, generate reviewer personas who would evaluate this decision in a governance review.

CONTEXT:
${context}

TENSIONS:
${JSON.stringify(tensions, null, 2)}${precedentBlock}

Respond with ONLY a JSON object matching this schema:
{
  "personas": [
    {
      "id": "p1",
      "name": "The [Role] Reviewer",
      "perspective": "What they care about most",
      "background": "Brief background that explains their viewpoint",
      "likely_concerns": ["concern1", "concern2"],
      "communication_style": "How they typically deliver feedback",
      "relevant_tensions": ["t1", "t2"]
    }
  ]
}

Generate exactly 5 personas. Each should map to specific tensions from the tension map. Make them feel like real governance reviewers — not caricatures. Give them specific domain knowledge relevant to this decision.`;
}
