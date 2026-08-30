import { describe, it, expect } from "vitest";
import { calculateUnderwriting } from "../lib/underwriting";

const baseInput = {
  arv: 250000,
  rehabEstimate: 40000,
  purchasePrice: 120000,
  holdingMonths: 6,
  downPaymentPct: 20,
  interestRate: 10,
  loanPoints: 2,
};

describe("calculateUnderwriting", () => {
  it("computes the 70% MAO correctly", () => {
    // MAO = ARV * 0.70 - rehabEstimate
    const result = calculateUnderwriting(baseInput);
    expect(result.maxOffer).toBeCloseTo(250000 * 0.7 - 40000, 2); // 135000
  });

  it("caps purchase price at the 70% MAO", () => {
    // purchasePrice (120k) < MAO (135k) → no cap
    const within = calculateUnderwriting(baseInput);
    expect(within.finalPurchasePrice).toBe(120000);

    // purchasePrice (150k) > MAO (135k) → capped
    const over = calculateUnderwriting({ ...baseInput, purchasePrice: 150000 });
    expect(over.finalPurchasePrice).toBe(135000);
    expect(over.passes70Rule).toBe(false);
  });

  it("marks the deal as passing when final price is within the MAO", () => {
    const result = calculateUnderwriting(baseInput);
    expect(result.passes70Rule).toBe(true);
  });

  it("computes all-in cost components deterministically", () => {
    const result = calculateUnderwriting(baseInput);

    // Acquisition costs: 2% of final purchase price
    expect(result.acquisitionCosts).toBeCloseTo(120000 * 0.02, 2); // 2400

    // Holding costs per month: 0.15% of purchase price / month
    expect(result.holdingCosts).toBeCloseTo(120000 * 0.0015, 2); // 180

    // Selling costs: 8% of ARV
    expect(result.sellingCosts).toBeCloseTo(250000 * 0.08, 2); // 20000

    // Financing: loan = 80% of price (96k); points = 2% of loan (1920);
    // interest = 10%/yr for 6 months = 5% of loan (4800); total = 6720
    const loan = 120000 * 0.8; // 96000
    expect(result.loanAmount).toBeCloseTo(loan, 2);
    expect(result.financingCosts).toBeCloseTo(loan * 0.02 + loan * 0.1 * (6 / 12), 2); // 6720

    // Total project cost
    const total =
      120000 + 40000 + 2400 + 180 * 6 + 20000 + 6720;
    expect(result.totalProjectCost).toBeCloseTo(total, 2);
  });

  it("computes profit, ROI, and cash-on-cash", () => {
    const result = calculateUnderwriting(baseInput);

    const total = result.totalProjectCost;
    const profit = 250000 - total;
    expect(result.projectedProfit).toBeCloseTo(profit, 2);

    // ROI = profit / total project cost
    expect(result.roi).toBeCloseTo((profit / total) * 100, 2);

    // Cash-on-cash = profit / cash invested (total cost - loan)
    const cashInvested = total - result.loanAmount;
    expect(result.cashOnCash).toBeCloseTo((profit / cashInvested) * 100, 2);

    // Down payment
    expect(result.downPaymentAmount).toBeCloseTo(120000 * 0.2, 2); // 24000
  });

  it("handles the zero holding period edge case", () => {
    const result = calculateUnderwriting({
      ...baseInput,
      holdingMonths: 0,
    });

    // holdingCosts is the per-month carry rate (unchanged), but total holding
    // contributes 0 to the all-in cost.
    expect(result.holdingCosts).toBeCloseTo(120000 * 0.0015, 2);
    // No time for interest to accrue; points still apply
    expect(result.financingCosts).toBeCloseTo(result.loanAmount * 0.02, 2);
    // Total project cost excludes any holding carry
    const withoutHold =
      result.finalPurchasePrice +
      40000 +
      result.acquisitionCosts +
      result.sellingCosts +
      result.financingCosts;
    expect(result.totalProjectCost).toBeCloseTo(withoutHold, 2);
  });

  it("handles a fully cash purchase (0 down payment)", () => {
    const result = calculateUnderwriting({
      ...baseInput,
      downPaymentPct: 100,
    });

    expect(result.downPaymentAmount).toBeCloseTo(120000, 2);
    expect(result.loanAmount).toBe(0);
    expect(result.financingCosts).toBeCloseTo(0, 2);
  });

  it("clamps negative inputs to zero", () => {
    const result = calculateUnderwriting({
      arv: -100,
      rehabEstimate: -5,
      purchasePrice: 10,
      holdingMonths: 3,
      downPaymentPct: 20,
      interestRate: 10,
      loanPoints: 0,
    });

    expect(result.maxOffer).toBe(0);
    expect(result.finalPurchasePrice).toBe(0);
  });
});
