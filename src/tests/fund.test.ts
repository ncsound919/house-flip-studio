import { describe, it, expect } from "vitest";
import { computeFundTotals } from "../lib/finance/fund";

describe("computeFundTotals", () => {
  it("splits deployed capital by source and separates active vs closed", () => {
    const t = computeFundTotals(
      [
        { source_type: "operator_equity", amount: 20_000, status: "active" },
        { source_type: "partner_capital", amount: 30_000, status: "active" },
        { source_type: "operator_equity", amount: 5_000, status: "repaid" },
      ],
      [{ balance: 100_000 }],
      [{ stage: "Rehab" }, { stage: "Closed" }, { stage: "Lead" }]
    );
    expect(t.operatorEquity).toBe(20_000);
    expect(t.partnerCapital).toBe(30_000);
    expect(t.totalDebt).toBe(100_000);
    expect(t.capitalDeployed).toBe(150_000);
    expect(t.partnerShareOfDeployed).toBe(20); // 30k/150k
    expect(t.activeDeals).toBe(2);
    expect(t.closedDeals).toBe(1);
    expect(t.equityAtRisk).toBe(50_000);
  });

  it("excludes non-active capital and returns zeros when empty", () => {
    const t = computeFundTotals([], [], []);
    expect(t.operatorEquity).toBe(0);
    expect(t.partnerCapital).toBe(0);
    expect(t.capitalDeployed).toBe(0);
    expect(t.partnerShareOfDeployed).toBe(0);
  });
});
