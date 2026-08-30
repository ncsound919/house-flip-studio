import { z } from "zod";

export interface LLMRequest {
  prompt: string;
  system?: string;
  outputSchema?: z.ZodSchema;
  model?: string;
}

export interface LLMResponse {
  text: string;
  model: string;
  usage?: { tokens: number; cost: number };
}

const DEFAULT_MODEL = "google/gemini-2.0-flash-exp";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function getConfiguredModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

function getFallbackModels(): string[] {
  return (process.env.OPENROUTER_FALLBACK_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

// OpenRouter supports { type: "json_object" } on many models. When a schema is
// provided we also instruct the model to emit valid JSON in the system prompt.
function buildResponseFormat(schema?: z.ZodSchema): Record<string, unknown> | undefined {
  if (!schema) return undefined;
  return { type: "json_object" };
}

function buildSystemPrompt(system: string | undefined, schema: z.ZodSchema | undefined): string | undefined {
  if (!schema) return system;
  const schemaHint = `\n\nReturn ONLY valid JSON matching the requested structure. Do not wrap in markdown.`;
  return system ? `${system}${schemaHint}` : `You are a helpful assistant.${schemaHint}`;
}

async function callModel(
  model: string,
  messages: { role: string; content: string }[],
  responseFormat?: Record<string, unknown>
): Promise<LLMResponse> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to your .env.local to use LLM features."
    );
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
      "X-Title": "NC-Flip-Studio",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  });

  if (!res.ok) {
    let detail = `OpenRouter request failed (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error?.message) detail = `OpenRouter: ${data.error.message}`;
    } catch {
      // fall through
    }
    throw new Error(detail);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  const usage = data?.usage;
  return {
    text,
    model: data?.model ?? model,
    usage: usage
      ? {
          tokens: usage.total_tokens ?? 0,
          cost: 0, // OpenRouter returns per-token pricing in 'cost' when available
        }
      : undefined,
  };
}

/**
 * Generate text via OpenRouter.
 *
 * Model fallback chain: OPENROUTER_MODEL → OPENROUTER_FALLBACK_MODELS.
 * If the API key is missing or all models fail, throws a descriptive error.
 */
export async function generate(request: LLMRequest): Promise<LLMResponse> {
  const system = buildSystemPrompt(request.system, request.outputSchema);
  const messages: { role: string; content: string }[] = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: request.prompt });

  const responseFormat = buildResponseFormat(request.outputSchema);
  const models = [
    request.model || getConfiguredModel(),
    ...getFallbackModels(),
  ];

  let lastError: Error | null = null;
  for (const model of models) {
    try {
      return await callModel(model, messages, responseFormat);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw new Error(
    `All OpenRouter models failed. Last error: ${lastError?.message}. ` +
      "Check OPENROUTER_API_KEY and OPENROUTER_MODEL."
  );
}
