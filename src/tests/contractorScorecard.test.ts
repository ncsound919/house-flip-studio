import { describe, it, expect } from "vitest";
import { computeContractorScorecards, type ScorecardItem } from "../lib/finance/contractorScorecard";

const item = (over: Partial<ScorecardItem> & { id: string }): ScorecardItem => ({
  id: over.id,
  contractor_id: over.contractor_id ?? null,
  contractor_name: over.contractor_name ?? null,
  trade: over.trade ?? null,
  status: over.status ?? "contracted",
  estimated_cost: over.estimated_cost ?? 0,
  actual_cost: over.actual_cost ?? 0,
});

describe("computeContractorScorecards", () => {
  it("computes bid vs actual variance and rating per contractor", () => {
    const cards = computeContractorScorecards(
      [
        item({ id: "a", contractor_id: "c1", contractor_name: "Ace Roofing", trade: "Roofing", status: "completed", estimated_cost: 10_000, actual_cost: 10_500 }),
        item({ id: "b", contractor_id: "c1", contractor_name: "Ace Roofing", trade: "Roofing", status: "completed", estimated_cost: 8_000, actual_cost: 10_000 }),
      ],
      []
    );
    expect(cards).toHaveLength(1);
    const ace = cards[0];
    expect(ace.name).toBe("Ace Roofing");
    expect(ace.bidTotal).toBe(18_000);
    expect(ace.actualTotal).toBe(20_500);
    expect(ace.variancePct).toBe(14); // 2500/18000
    expect(ace.rating).toBe("average");
    expect(ace.completedItems).toBe(2);
  });

  it("skips items with no contractor assigned", () => {
    const cards = computeContractorScorecards([item({ id: "a", contractor_id: null })], []);
    expect(cards).toHaveLength(0);
  });

  it("counts approved change orders per contractor's items", () => {
    const cards = computeContractorScorecards(
      [item({ id: "a", contractor_id: "c1", contractor_name: "Wiring Co", estimated_cost: 5_000 })],
      [
        { rehab_item_id: "a", status: "approved", cost_impact: 1_000 },
        { rehab_item_id: "a", status: "rejected", cost_impact: 9_000 },
      ]
    );
    expect(cards[0].changeOrderCount).toBe(1);
  });

  it("returns null variance when nothing has actuals or estimates are zero", () => {
    const cards = computeContractorScorecards(
      [item({ id: "a", contractor_id: "c1", contractor_name: "New Guy", status: "contracted", estimated_cost: 0 })],
      []
    );
    expect(cards[0].variancePct).toBeNull();
  });
});
