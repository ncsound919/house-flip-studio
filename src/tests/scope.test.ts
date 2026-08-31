import { describe, it, expect } from "vitest";
import { deterministicScope, generateScopeForDeal } from "../lib/agent/scope";
import { DEFAULT_SETTINGS } from "../lib/orgSettings";

describe("deterministicScope", () => {
  it("allocates sqft × rehabPerSqft across trades, summed to the total", () => {
    const lines = deterministicScope({ sqft: 1500, year_built: 1970 }, 40);
    const total = lines.reduce((s, l) => s + l.estimated_cost, 0);
    expect(total).toBeGreaterThan(50_000);
    expect(total).toBeLessThanOrEqual(60_000);
    expect(lines.length).toBe(8);
    const trades = new Set(lines.map((l) => l.trade));
    expect(trades.has("Roofing")).toBe(true);
    expect(trades.has("Interior")).toBe(true);
  });

  it("older homes get a larger roofing/mechanical share", () => {
    const older = deterministicScope({ sqft: 1000, year_built: 1950 }, 40);
    const newer = deterministicScope({ sqft: 1000, year_built: 2010 }, 40);
    const olderRoof = older.find((l) => l.trade === "Roofing")!.estimated_cost;
    const newerRoof = newer.find((l) => l.trade === "Roofing")!.estimated_cost;
    expect(olderRoof).toBeGreaterThan(newerRoof);
  });

  it("never returns a negative or zero total for valid input", () => {
    const lines = deterministicScope({ sqft: 900, year_built: 2000 }, 30);
    expect(lines.every((l) => l.estimated_cost > 0)).toBe(true);
  });
});

describe("generateScopeForDeal", () => {
  it("returns deterministic source when LLM scope generation is disabled", async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      llm: { generateScopes: false },
    };
    const res = await generateScopeForDeal({ sqft: 1200, year_built: 1975, address: "1 Test St" }, settings);
    expect(res.source).toBe("deterministic");
    expect(res.lines.length).toBe(8);
    expect(res.notes.some((n) => n.includes("1200 sqft"))).toBe(true);
  });

  it("degrades to deterministic when LLM is enabled but unavailable", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const res = await generateScopeForDeal({ sqft: 1200 }, DEFAULT_SETTINGS);
    expect(res.source).toBe("deterministic");
    expect(res.lines.length).toBe(8);
  });
});