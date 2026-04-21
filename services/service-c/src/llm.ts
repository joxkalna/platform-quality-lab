import type { Config } from "./config";
import type { ClassificationResult } from "./types";
import { VALID_CATEGORIES } from "./types";

export type { ClassificationResult };

const SYSTEM_PROMPT = `You are a text classifier. Classify the input into exactly one of these categories: critical, warning, info, ok.

Respond with ONLY a JSON object in this exact format, no other text:
{"category": "<category>", "confidence": <0.0-1.0>}`;

export const classify = async (
  text: string,
  config: Config
): Promise<ClassificationResult> => {
  const response = await fetch(`${config.llmEndpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.llmModel,
      prompt: `Classify this text:\n\n${text}`,
      system: SYSTEM_PROMPT,
      stream: false,
      options: { temperature: config.llmTemperature },
    }),
    signal: AbortSignal.timeout(config.llmTimeout),
  });

  if (!response.ok) {
    throw new Error(`LLM returned ${response.status}: ${response.statusText}`);
  }

  const data = (await response.json()) as { response: string };
  const parsed = parseResponse(data.response);

  return { ...parsed, model: config.llmModel };
};

const parseResponse = (raw: string): { category: string; confidence: number } => {
  const jsonMatch = raw.match(/\{[^}]+\}/);
  if (!jsonMatch) {
    throw new Error(`LLM response is not valid JSON: ${raw.slice(0, 200)}`);
  }

  const parsed = JSON.parse(jsonMatch[0]);

  if (!VALID_CATEGORIES.includes(parsed.category)) {
    throw new Error(`Invalid category "${parsed.category}" — expected one of: ${VALID_CATEGORIES.join(", ")}`);
  }

  const confidence = Number(parsed.confidence);
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    throw new Error(`Invalid confidence "${parsed.confidence}" — expected number between 0 and 1`);
  }

  return { category: parsed.category, confidence: `${confidence}` };
};
