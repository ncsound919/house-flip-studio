import { describe, it, expect } from "vitest";
import { mapParcel } from "../lib/listingSources/countyParcels";
import { scoreLead, type LeadScore } from "../lib/leadScoring";
import type { ListingCard } from "../lib/listingSources/types";

function card(over: Partial<ListingCard> = {}): ListingCard {
  return {
    address: "1 Main St",
    county: "Wake",
    source: "county_gis",
    source_label: "nc_onemap_parcel",
    parcel: { assessedValue: 80_000, pin: "123" },
    motivation: {
      absenteeOwner: false, outOfStateOwner: false, longHeld: false, olderHome: true,
      multiParcelOwner: false, taxDelinquent: false, reasonCount: 0, reasons: [],
    },
    ...over,
  };
}

describe("lead scoring — new research signals", () => {
  it("adds score for multi-parcel owner", () => {
    const s = scoreLead(card({ motivation: { ...card().motivation!, multiParcelOwner: true, reasonCount: 1, reasons: ["x"] } }));
    expect(s.attentionScore).toBeGreaterThan(50);
  });

  it("adds score and flag for tax delinquent", () => {
    const s = scoreLead(card({ motivation: { ...card().motivation!, taxDelinquent: true, reasonCount: 1, reasons: ["y"] } }));
    expect(s.attentionScore).toBeGreaterThan(50);
    expect(s.flags.join(" ")).toContain("tax");
  });
});

describe("county parcel research signals", () => {
  it("flags multi-parcel owner from ownerCount >= 3", () => {
    const card = mapParcel({ siteadd: "1 Main St", mailadd: "PO Box 5", mstate: "NC", ownname: "SMITH JOHN", parno: "123", structyear: "1975", parval: "80000", ownerCount: 3 });
    expect(card.motivation?.multiParcelOwner).toBe(true);
  });

  it("flags tax delinquent when taxDelinquent flag present", () => {
    const card = mapParcel({ siteadd: "1 Main St", mailadd: "1 Main St", mstate: "NC", ownname: "JONES", parno: "999", structyear: "1975", parval: "80000", taxDelinquent: "Y" });
    expect(card.motivation?.taxDelinquent).toBe(true);
  });

  it("does not flag when signals absent", () => {
    const card = mapParcel({ siteadd: "1 Main St", mailadd: "1 Main St", mstate: "NC", ownname: "BROWN", parno: "77", structyear: "1975", parval: "80000" });
    expect(card.motivation?.multiParcelOwner).toBe(false);
    expect(card.motivation?.taxDelinquent).toBe(false);
  });
});