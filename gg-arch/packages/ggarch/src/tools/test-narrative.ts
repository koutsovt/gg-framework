import { callLlm } from "@gg-arch/agent";
import {
  NarrativeAssessmentSchema,
  type NarrativeAssessment,
  type Persona,
} from "../schemas.js";
import { narrativePrompt } from "../prompts/narrative.js";

export async function testNarrative(
  framing: string,
  persona: Persona
): Promise<NarrativeAssessment> {
  return callLlm(narrativePrompt(framing, persona), NarrativeAssessmentSchema);
}
