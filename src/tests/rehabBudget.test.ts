import { describe, it, expect } from "vitest";
import { computeRehabBudget, type BudgetItem } from "../lib/finance/rehabBudget";

const item = (over: Partial<BudgetItem> & { id: string }): BudgetItem => ({
  id: over.id,
  trade: over.trade ?? "General",
  status: over.status ?? "estimated",
  estimated_cost: over.estimated_cost ?? 0,
  actual_cost: over.actual_cost ?? 0,
});

describe("computeRehabBudget", () => {
  it("computes estimate, committed, actual, and projection", () => {
    const b = computeRehabBudget(
      [
        item({ id: "a", trade: "Roofing", status: "completed", estimated_cost: 10_000, actual_cost: 11_000 }),
        item({ id: "b", trade: "Electrical", status: "contracted", estimated_cost: 5_000 }),
        item({ id: "c", trade: "Interior", status: "estimated", estimated_cost: 8_000 }),
      ],
      []
    );
    expect(b.originalEstimate).toBe(23_000);
    expect(b.committed).toBe(15_000); // completed + contracted
    expect(b.actualSpend).toBe(11_000);
    expect(b.remainingToCommit).toBe(8_000);
    expect(b.projectedTotal).toBe(11_000 + 5_000 + 8_000);
    expect(b.variance).toBe(1_000); // 24_000 - 23_000
    expect(b.variancePct).toBe(4); // 1000/23000 = 4.3% → 4
    expect(b.status).toBe("on_track");
  });

  it("flags over-budget projects at 15%+ variance", () => {
    const b = computeRehabBudget(
      [item({ id: "a", status: "completed", estimated_cost: 10_000, actual_cost: 12_000 })],
      []
    );
    expect(b.variancePct).toBe(20);
    expect(b.status).toBe("over_budget");
  });

  it("surfaces approved change orders without double counting them", () => {
    const b = computeRehabBudget(
      [item({ id: "a", status: "contracted", estimated_cost: 10_000 })],
      [
        { rehab_item_id: "a", status: "approved", cost_impact: 2_000 },
        { rehab_item_id: "a", status: "pending", cost_impact: 5_000 },
      ]
    );
    expect(b.approvedChangeOrders).toBe(2_000);
  });

  it("lists over-budget trades", () => {
    const b = computeRehabBudget(
      [
        item({ id: "a", trade: "Roofing", status: "completed", estimated_cost: 10_000, actual_cost: 14_000 }),
        item({ id: "b", trade: "Electrical", status: "completed", estimated_cost: 5_000, actual_cost: 4_000 }),
      ],
      []
    );
    expect(b.overBudgetTrades.map((t) => t.trade)).toEqual(["Roofing"]);
    expect(b.overBudgetTrades[0].variance).toBe(4_000);
  });

  it("returns zeros for an empty project", () => {
    const b = computeRehabBudget([], []);
    expect(b.originalEstimate).toBe(0);
    expect(b.projectedTotal).toBe(0);
    expect(b.status).toBe("on_track");
  });
});
