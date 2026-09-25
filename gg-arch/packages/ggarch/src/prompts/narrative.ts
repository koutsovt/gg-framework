import type { Persona } from "../schemas.js";

export function narrativePrompt(
  framing: string,
  persona: Persona
): string {
  return `You are acting as this reviewer persona. Evaluate the following narrative framing — how the architect plans to present and justify their decision to the governance body.

NARRATIVE FRAMING:
${framing}

YOUR PERSONA:
${JSON.stringify(persona, null, 2)}

Assess whether this framing would be effective with someone who has your perspective and concerns. Be honest about what lands and what doesn't.

Respond with ONLY a JSON object:
{
  "effectiveness": "strong" | "adequate" | "weak",
  "resonates_with": ["What aspects of the framing work well for this persona"],
  "gaps": ["What's missing or unconvincing from this persona's perspective"],
  "suggested_reframe": "How you'd suggest reframing to better address this persona's concerns",
  "reasoning": "Brief explanation of why you assessed it this way"
}`;
}
