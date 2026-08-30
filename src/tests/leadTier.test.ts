import { describe, it, expect } from "vitest";
import { tierForLead, tierLabel, scoreAndTier } from "../lib/leadTier";
import { scoreLead } from "../lib/leadScoring";
import type { ListingCard } from "../lib/listingSources/types";

const baseCard: Pick<ListingCard, "address" | "county" | "source" | "source_label" | "disclaimer"> = {
  address: "123 Test St",
  county: "Mecklenburg",
  source: "api",
  source_label: "zillow",
  disclaimer: "test",
};

const highScoreCard: ListingCard = { ...baseCard, price: 200_000, sqft: 1500 };
const mediumScoreCard: ListingCard = { ...baseCard, price: 280_000, sqft: 1500 };
const lowScoreCard: ListingCard = { ...baseCard, price: 500_000, sqft: 1500 };

function motivationWith(count: number, extra: Partial<ListingCard["motivation"]> = {}): ListingCard["motivation"] {
  return {
    absenteeOwner: false,
    outOfStateOwner: false,
    longHeld: false,
    olderHome: false,
    reasonCount: count,
    reasons: Array.from({ length: count }, (_, i) => `signal-${i + 1}`),
    ...extra,
  };
}

describe("tierLabel", () => {
  it("returns the right labels", () => {
    expect(tierLabel("hot")).toBe("HOT LEAD");
    expect(tierLabel("warm")).toBe("WARM LEAD");
    expect(tierLabel("cold")).toBe("COLD LEAD");
  });
});

describe("tierForLead", () => {
  it("HOT: high score + 2+ motivation signals", () => {
    const card: ListingCard = { ...highScoreCard, motivation: motivationWith(2) };
    const score = scoreLead(card);
    expect(tierForLead(card, score)).toBe("hot");
  });

  it("HOT: high score + out-of-state owner even with 0 other signals", () => {
    const card: ListingCard = {
      ...highScoreCard,
      motivation: motivationWith(1, { outOfStateOwner: true }),
    };
    const score = scoreLead(card);
    expect(tierForLead(card, score)).toBe("hot");
  });

  it("WARM: high score alone (no motivation signals)", () => {
    const card: ListingCard = { ...highScoreCard, motivation: motivationWith(0) };
    const score = scoreLead(card);
    expect(tierForLead(card, score)).toBe("warm");
  });

  it("WARM: medium score + at least 1 motivation signal", () => {
    const card: ListingCard = { ...mediumScoreCard, motivation: motivationWith(1) };
    const score = scoreLead(card);
    expect(tierForLead(card, score)).toBe("warm");
  });

  it("COLD: medium score + no motivation", () => {
    const card: ListingCard = { ...mediumScoreCard, motivation: motivationWith(0) };
    const score = scoreLead(card);
    expect(tierForLead(card, score)).toBe("cold");
  });

  it("COLD: low score regardless of motivation", () => {
    const card: ListingCard = { ...lowScoreCard, motivation: motivationWith(3) };
    const score = scoreLead(card);
    expect(tierForLead(card, score)).toBe("cold");
  });
});

describe("scoreAndTier", () => {
  it("returns both score and tier together", () => {
    const card: ListingCard = { ...highScoreCard, motivation: motivationWith(2) };
    const result = scoreAndTier(card);
    expect(result.score).toBeDefined();
    expect(result.score.attentionScore).toBeGreaterThan(0);
    expect(result.tier).toBe("hot");
  });
});
