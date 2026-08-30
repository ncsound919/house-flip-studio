import { describe, it, expect } from "vitest";
import { scoreLead, medianPricePerSqft } from "../lib/leadScoring";

const baseCard = {
  address: "123 Test St",
  county: "Mecklenburg",
  source: "api" as const,
  source_label: "zillow",
  disclaimer: "test",
};

describe("scoreLead", () => {
  it("never invents ARV — always flags needsArv", () => {
    const score = scoreLead({ ...baseCard, price: 200000, sqft: 1500 });
    expect(score.needsArv).toBe(true);
    expect(score.canAct).toBe(true);
  });

  it("rewards price well below county median", () => {
    // Mecklenburg median ~210/sqft. 1500 sqft * 210 = 315k. A 200k price is ~63% → +25.
    const score = scoreLead({ ...baseCard, price: 200000, sqft: 1500 });
    expect(score.rating).toBe("high");
    expect(score.attentionScore).toBeGreaterThanOrEqual(70);
  });

  it("penalizes price well above county median", () => {
    // 1500 * 210 = 315k median. 450k price = 143% → -20 and flag.
    const score = scoreLead({ ...baseCard, price: 450000, sqft: 1500 });
    expect(score.rating).toBe("low");
    expect(score.flags.some((f) => f.includes("county median"))).toBe(true);
  });

  it("flags missing price and disables action", () => {
    const score = scoreLead({ ...baseCard, sqft: 1500 });
    expect(score.flags).toContain("No price listed");
    expect(score.canAct).toBe(false);
  });

  it("clamps score to 0-100", () => {
    // Extremely cheap → should clamp at 100
    const cheap = scoreLead({ ...baseCard, price: 1000, sqft: 5000 });
    expect(cheap.attentionScore).toBeLessThanOrEqual(100);
    // Extremely expensive → clamp at 0
    const pricey = scoreLead({ ...baseCard, price: 90000000, sqft: 100 });
    expect(pricey.attentionScore).toBeGreaterThanOrEqual(0);
  });

  it("computes pricePerSqft and estimated rehab", () => {
    const score = scoreLead({ ...baseCard, price: 300000, sqft: 2000 });
    expect(score.pricePerSqft).toBe(150);
    expect(score.estimatedRehabPerSqft).toBe(80000); // 2000 * 40
  });

  it("handles unknown county with default benchmark", () => {
    const score = scoreLead({ ...baseCard, county: "Avery", price: 200000, sqft: 1500 });
    expect(score.attentionScore).toBeGreaterThanOrEqual(0);
  });

  it("medianPricePerSqft falls back to default", () => {
    expect(medianPricePerSqft("Avery")).toBe(185);
    expect(medianPricePerSqft("Mecklenburg")).toBe(210);
  });
});
