import Anthropic from "@anthropic-ai/sdk";
import { type ZodSchema } from "zod";
import { buildSystemPrompt } from "@gg-arch/ai";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export interface LlmCallOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
}

export async function callLlm<T>(
  prompt: string,
  schema: ZodSchema<T>,
  options: LlmCallOptions = {}
): Promise<T> {
  const {
    model = "claude-sonnet-4-20250514",
    maxTokens = 4000,
    systemPrompt,
  } = options;

  const anthropic = getClient();
  const system = systemPrompt ?? buildSystemPrompt();

  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse LLM response as JSON:\n${text.slice(0, 500)}`
    );
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `LLM response failed schema validation:\n${result.error.message}\n\nRaw response:\n${text.slice(0, 500)}`
    );
  }

  return result.data;
}
