import { callLlm } from "@gg-arch/agent";
import { TensionMapSchema, type TensionMap } from "../schemas.js";
import { tensionPrompt } from "../prompts/tension.js";

export async function extractTensions(context: string): Promise<TensionMap> {
  return callLlm(tensionPrompt(context), TensionMapSchema);
}
