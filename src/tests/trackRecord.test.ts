import { describe, it, expect } from "vitest";
import {
  buildTrackRecord,
  computeTrackRecordSummary,
  type TrackRecordDeal,
} from "../lib/finance/trackRecord";

const deal = (over: Partial<TrackRecordDeal> & { id: string; address: string }): TrackRecordDeal => ({
  id: over.id,
  address: over.address,
  city: over.city ?? null,
  state: over.state ?? "NC",
  stage: over.stage ?? "Lead",
  created_at: over.created_at ?? "2026-01-01T00:00:00Z",
  stage_changed_at: over.stage_changed_at ?? null,
  final_sale_price: over.final_sale_price ?? null,
});

describe("buildTrackRecord", () => {
  const input = {
    deals: [
      deal({
        id: "closed-1",
        address: "100 Main St",
        stage: "Closed",
        created_at: "2026-01-01T00:00:00Z",
        stage_changed_at: "2026-06-01T00:00:00Z",
        final_sale_price: 220_000,
      }),
      deal({ id: "open-1", address: "200 Oak Ave", stage: "Rehab", created_at: "2026-03-01T00:00:00Z" }),
    ],
    underwriting: [
      {
        deal_id: "closed-1",
        purchase_price: 150_000,
        acquisition_costs: 3_000,
        financing_costs: 6_000,
        selling_costs: 17_600,
      },
      { deal_id: "open-1", purchase_price: 160_000, arv: 210_000, projected_profit: 18_000 },
    ],
    rehabActualByDeal: { "closed-1": 30_000, "open-1": 8_000 },
  };

  it("builds a realized row for a Closed deal with a real sale price", () => {
    const rows = buildTrackRecord(input);
    const row = rows.find((r) => r.dealId === "closed-1");
    expect(row?.isRealized).toBe(true);
    expect(row?.salePrice).toBe(220_000);
    expect(row?.profit).toBe(13_400); // 220000 - 150000 - 3000 - 30000 - 6000 - 17600
    expect(row?.roi).toBe(6); // 13400 / 206000
    expect(row?.cycleDays).toBe(151);
    expect(row?.holdingMonths).toBe(5);
  });

  it("labels open deals projected and never invents a sale price", () => {
    const rows = buildTrackRecord(input);
    const row = rows.find((r) => r.dealId === "open-1");
    expect(row?.isRealized).toBe(false);
    expect(row?.salePrice).toBeNull();
    expect(row?.profit).toBe(18_000);
  });

  it("sorts realized rows first", () => {
    const rows = buildTrackRecord(input);
    expect(rows[0].isRealized).toBe(true);
    expect(rows[1].isRealized).toBe(false);
  });

  it("does not fabricate a realized row for a Closed deal with no sale price", () => {
    const rows = buildTrackRecord({
      deals: [deal({ id: "x", address: "1 A St", stage: "Closed" })],
      underwriting: [{ deal_id: "x" }],
      rehabActualByDeal: {},
    });
    expect(rows[0].isRealized).toBe(false);
    expect(rows[0].salePrice).toBeNull();
  });
});

describe("computeTrackRecordSummary", () => {
  it("summarizes only realized deals", () => {
    const input = {
      deals: [
        deal({
          id: "c1",
          address: "1",
          stage: "Closed",
          created_at: "2026-01-01T00:00:00Z",
          stage_changed_at: "2026-04-01T00:00:00Z",
          final_sale_price: 200_000,
        }),
        deal({ id: "c2", address: "2", stage: "Closed", created_at: "2026-02-01T00:00:00Z", stage_changed_at: "2026-05-01T00:00:00Z", final_sale_price: 180_000 }),
        deal({ id: "o", address: "3", stage: "Rehab" }),
      ],
      underwriting: [
        { deal_id: "c1", purchase_price: 140_000 },
        { deal_id: "c2", purchase_price: 130_000 },
        { deal_id: "o", purchase_price: 150_000, arv: 200_000, projected_profit: 20_000 },
      ],
      rehabActualByDeal: { c1: 10_000, c2: 8_000 },
    };
    const rows = buildTrackRecord(input);
    const s = computeTrackRecordSummary(rows);
    expect(s.realizedCount).toBe(2);
    expect(s.realizedProfit).toBeGreaterThan(0);
    expect(s.avgProfit).not.toBeNull();
    expect(s.avgCycleDays).toBe(90); // 89 + 89 days → 90
    expect(s.totalInvested).toBe(140_000 + 130_000 + 10_000 + 8_000);
  });

  it("returns zeros/nulls with no realized deals", () => {
    const s = computeTrackRecordSummary([]);
    expect(s.realizedCount).toBe(0);
    expect(s.realizedProfit).toBe(0);
    expect(s.avgProfit).toBeNull();
    expect(s.roi).toBeNull();
  });
});
