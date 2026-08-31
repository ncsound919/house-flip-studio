import { describe, it, expect } from "vitest";
import { buildDeterministicRfq, buildBudgetBand, formatCurrency } from "../lib/rfqBuilder";

describe("rfqBuilder", () => {
  const input = {
    contractorName: "Acme Roofing",
    contractorTrade: "Roofing",
    address: "123 Main St, Charlotte, NC 28202",
    scopeLines: [
      { trade: "Roofing", description: "Replace shingles", estimatedCost: 9000 },
      { trade: "General", description: "Permits", estimatedCost: 1000 },
    ],
  };

  it("builds a deterministic draft with address, scope, and budget band", () => {
    const draft = buildDeterministicRfq(input);
    expect(draft).toContain("123 Main St, Charlotte, NC 28202");
    expect(draft).toContain("Acme Roofing (Roofing)");
    expect(draft).toContain("Replace shingles — $9,000 est.");
    expect(draft).toContain("Permits — $1,000 est.");
    // Total 10,000 → band 10,000–11,500
    expect(draft).toContain("$10,000–$11,500");
    expect(draft).toContain("N.C.G.S. § 87-1");
  });

  it("marks scope as TBD when no line items exist", () => {
    const draft = buildDeterministicRfq({
      ...input,
      scopeLines: [],
    });
    expect(draft).toContain("Scope TBD");
  });

  it("buildBudgetBand uses +15% contingency ceiling", () => {
    expect(buildBudgetBand(10_000)).toBe("$10,000–$11,500");
    expect(buildBudgetBand(0)).toBe("TBD — awaiting estimates");
  });

  it("formatCurrency formats USD without decimals", () => {
    expect(formatCurrency(10000)).toBe("$10,000");
    expect(formatCurrency(1234)).toBe("$1,234");
  });
});