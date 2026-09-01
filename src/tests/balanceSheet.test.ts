import { describe, it, expect } from "vitest";
import { computeBalanceSheet, type AccountRow } from "../lib/finance/balanceSheet";

const acct = (over: Partial<AccountRow> & { account_name: string }): AccountRow => ({
  id: over.account_name,
  account_name: over.account_name,
  account_type: over.account_type ?? "cash",
  balance: over.balance ?? 0,
  as_of: over.as_of ?? "2026-09-01",
  notes: over.notes ?? null,
});

describe("computeBalanceSheet", () => {
  it("sums assets by type and includes debt schedule as liabilities", () => {
    const sheet = computeBalanceSheet(
      [
        acct({ account_name: "Operating", balance: 25_000 }),
        acct({ account_name: "Buyer note", account_type: "receivable", balance: 5_000 }),
        acct({ account_name: "Equipment", account_type: "other_asset", balance: 3_000 }),
        acct({ account_name: "Vendor payable", account_type: "liability", balance: 1_000 }),
      ],
      [{ id: "d1", lender: "Hard Money", balance: 120_000 }]
    );

    expect(sheet.cash).toBe(25_000);
    expect(sheet.receivables).toBe(5_000);
    expect(sheet.otherAssets).toBe(3_000);
    expect(sheet.totalAssets).toBe(33_000);
    expect(sheet.manualLiabilities).toBe(1_000);
    expect(sheet.scheduleDebt).toBe(120_000);
    expect(sheet.totalLiabilities).toBe(121_000);
  });

  it("computes equity as the plug so the sheet always balances", () => {
    const sheet = computeBalanceSheet(
      [acct({ account_name: "Operating", balance: 30_000 })],
      [{ id: "d1", lender: "HELOC", balance: 10_000 }]
    );
    expect(sheet.computedEquity).toBe(20_000);
    expect(sheet.totalAssets - sheet.totalLiabilities).toBe(sheet.computedEquity);
  });

  it("never fabricates equity from empty data", () => {
    const sheet = computeBalanceSheet([], []);
    expect(sheet.totalAssets).toBe(0);
    expect(sheet.totalLiabilities).toBe(0);
    expect(sheet.computedEquity).toBe(0);
  });
});
