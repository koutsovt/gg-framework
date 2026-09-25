import { callLlm } from "@gg-arch/agent";
import { recentDecisions } from "@gg-arch/ai";
import { PersonaListSchema, type Persona, type Tension } from "../schemas.js";
import { personaPrompt } from "../prompts/persona.js";

export async function generatePersonas(
  context: string,
  tensions: Tension[]
): Promise<Persona[]> {
  const precedents = recentDecisions(5);
  const result = await callLlm(
    personaPrompt(context, tensions, precedents),
    PersonaListSchema
  );
  return result.personas;
}
