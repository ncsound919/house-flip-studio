import { describe, it, expect } from "vitest";
import { computeDebtTotals, type DebtRow } from "../lib/finance/debtSchedule";

const debt = (over: Partial<DebtRow> & { lender: string }): DebtRow => ({
  id: over.lender,
  lender: over.lender,
  kind: over.kind ?? "other",
  balance: over.balance ?? 0,
  interest_rate: over.interest_rate ?? null,
  monthly_payment: over.monthly_payment ?? null,
  maturity_date: over.maturity_date ?? null,
  collateral_deal_id: over.collateral_deal_id ?? null,
  notes: over.notes ?? null,
});

describe("computeDebtTotals", () => {
  it("sums balance and monthly obligations", () => {
    const totals = computeDebtTotals([
      debt({ lender: "L1", balance: 100_000, monthly_payment: 1_200 }),
      debt({ lender: "L2", balance: 50_000, monthly_payment: 600 }),
    ]);
    expect(totals.count).toBe(2);
    expect(totals.totalBalance).toBe(150_000);
    expect(totals.monthlyObligations).toBe(1_800);
  });

  it("computes a balance-weighted rate, not an average of rates", () => {
    const totals = computeDebtTotals([
      debt({ lender: "L1", balance: 100_000, interest_rate: 10 }),
      debt({ lender: "L2", balance: 100_000, interest_rate: 20 }),
    ]);
    expect(totals.weightedRate).toBe(15);
  });

  it("returns null weighted rate when no balance exists", () => {
    const totals = computeDebtTotals([debt({ lender: "L1", balance: 0, interest_rate: 10 })]);
    expect(totals.weightedRate).toBeNull();
  });

  it("counts secured debts by collateral", () => {
    const totals = computeDebtTotals([
      debt({ lender: "L1", collateral_deal_id: "deal-1" }),
      debt({ lender: "L2" }),
    ]);
    expect(totals.securedCount).toBe(1);
  });
});
