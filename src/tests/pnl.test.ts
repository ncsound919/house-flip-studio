import { describe, it, expect } from "vitest";
import { computeDealPnl } from "../lib/finance/pnl";

describe("computeDealPnl — realized", () => {
  it("computes realized P&L from a Closed deal with actuals", () => {
    const pnl = computeDealPnl({
      stage: "Closed",
      finalSalePrice: 220_000,
      purchasePrice: 150_000,
      acquisitionCosts: 3_000,
      rehabActual: 30_000,
      holdingMonths: 5,
      financingCosts: 6_000,
      sellingCosts: 17_600,
    });
    expect(pnl.realizedProfit).toBe(13_400); // 220000 - 150000 - 3000 - 30000 - 6000 - 17600
    expect(pnl.isRealized).toBe(true);
    expect(pnl.label).toBe("realized");
  });

  it("flags open deals as projected and uses underwriting projections", () => {
    const pnl = computeDealPnl({
      stage: "Rehab",
      finalSalePrice: null,
      purchasePrice: 140_000,
      acquisitionCosts: 3_000,
      rehabActual: 12_000,
      projectedRehab: 30_000,
      holdingMonths: 4,
      financingCosts: 4_800,
      projectedSellingCosts: 16_000,
      projectedArv: 200_000,
    });
    expect(pnl.isRealized).toBe(false);
    expect(pnl.label).toBe("projected");
    expect(pnl.projectedProfit).toBeGreaterThan(0);
  });
});

describe("computeDealPnl — honesty", () => {
  it("never fabricates a sale price for open deals", () => {
    const pnl = computeDealPnl({
      stage: "Lead", finalSalePrice: null, purchasePrice: 0, acquisitionCosts: 0,
      rehabActual: 0, holdingMonths: 0, financingCosts: 0, sellingCosts: 0,
    });
    expect(pnl.finalSalePrice).toBeNull();
    expect(pnl.isRealized).toBe(false);
  });
});