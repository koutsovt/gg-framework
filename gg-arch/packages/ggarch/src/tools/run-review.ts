import { callLlm } from "@gg-arch/agent";
import { ReviewSchema, type Review, type Tension, type Persona } from "../schemas.js";
import { reviewPrompt } from "../prompts/review.js";

export async function runReview(
  context: string,
  tensions: Tension[],
  persona: Persona
): Promise<Review> {
  return callLlm(reviewPrompt(context, tensions, persona), ReviewSchema);
}
