import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { generate, getConfiguredModel } from "../lib/llm";

// Stub global fetch for the OpenRouter HTTP call.
const openRouterResponse = (content: string) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content } }],
        model: "test/model",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
  }) as unknown as Response;

describe("getConfiguredModel", () => {
  beforeEach(() => {
    delete process.env.OPENROUTER_MODEL;
  });

  it("defaults to gemini-2.0-flash-exp when env var is not set", () => {
    expect(getConfiguredModel()).toBe("google/gemini-2.0-flash-exp");
  });

  it("reads the model from the environment", () => {
    process.env.OPENROUTER_MODEL = "anthropic/claude-3-haiku";
    expect(getConfiguredModel()).toBe("anthropic/claude-3-haiku");
  });
});

describe("generate", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "sk-or-v1-test";
    process.env.OPENROUTER_MODEL = "test/model";
    process.env.APP_URL = "http://localhost:3000";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns text, model, and usage", async () => {
    const fetchMock = vi.fn().mockResolvedValue(openRouterResponse("Hello from LLM"));
    globalThis.fetch = fetchMock;

    const res = await generate({ prompt: "Say hi" });
    expect(res.text).toBe("Hello from LLM");
    expect(res.model).toBe("test/model");
    expect(res.usage?.tokens).toBe(15);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws a clear message when the API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(generate({ prompt: "hi" })).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it("throws a descriptive error when the API returns an error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { message: "Rate limited" } }),
    } as unknown as Response);

    await expect(generate({ prompt: "hi" })).rejects.toThrow(/Rate limited|429|OpenRouter/i);
  });

  it("uses response_format when an output schema is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(openRouterResponse('{"ok":true}'));
    globalThis.fetch = fetchMock;

    const schema = z.object({ ok: z.boolean() });
    await generate({ prompt: "do it", outputSchema: schema });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.response_format).toBeTruthy();
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[1].role).toBe("user");
  });
});
