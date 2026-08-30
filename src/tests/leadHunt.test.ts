import { describe, it, expect, vi, afterEach } from "vitest";
import { huntLeads, scoreListings } from "../lib/leadHunt";
import { fetchCountyParcels, mapParcel } from "../lib/listingSources/countyParcels";
import * as apiHelpers from "../lib/apiHelpers";

// Real ArcGIS parcel JSON (what Wake's FeatureServer returns)
const wakeParcelsJson = {
  features: [
    {
      attributes: {
        OBJECTID: 1,
        PIN_NUM: "0695327712",
        SITE_ADDRESS: "7712 BILL LOVE RD",
        OWNER: "GURRAM, ANANDA PAPIREDDY",
        CITY_DECODE: "Raleigh",
        TOTAL_VALUE_ASSD: 619967,
        LAND_VAL: 141675,
        BLDG_VAL: 478292,
        YEAR_BUILT: 2018,
        HEATEDAREA: 2163,
        TOTSALPRICE: 795000,
        SALE_DATE: 1734307200000,
        CALC_AREA: 4.81,
      },
    },
    {
      attributes: {
        OBJECTID: 2,
        PIN_NUM: "0695320153",
        SITE_ADDRESS: "7716 BILL LOVE RD",
        OWNER: "GURRAM, ANANDA PAPIREDDY",
        CITY_DECODE: "Raleigh",
        TOTAL_VALUE_ASSD: 430225,
        YEAR_BUILT: null,
        HEATEDAREA: null,
        TOTSALPRICE: null,
        SALE_DATE: null,
      },
    },
  ],
};

function makeAdminMock(inserts: unknown[]) {
  const selectResult = { data: [], error: null };
  const builder = {
    from: () => builder,
    select: () => builder,
    insert: (row: unknown) => {
      inserts.push(row);
      return builder;
    },
    eq: () => builder,
    single: () => builder,
    order: () => builder,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(selectResult)),
  };
  return builder;
}

describe("mapParcel", () => {
  it("maps real Wake parcel fields into a ListingCard with parcel detail", () => {
    const card = mapParcel(wakeParcelsJson.features[0].attributes);
    expect(card.address).toBe("7712 BILL LOVE RD");
    expect(card.price).toBe(795000);
    expect(card.sqft).toBe(2163);
    expect(card.year_built).toBe(2018);
    expect(card.source_label).toBe("wake_tax_parcel");
    expect(card.parcel?.owner).toContain("GURRAM");
    expect(card.parcel?.assessedValue).toBe(619967);
    expect(card.parcel?.lastSaleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handles nulls gracefully", () => {
    const card = mapParcel(wakeParcelsJson.features[1].attributes);
    expect(card.address).toBe("7716 BILL LOVE RD");
    expect(card.price).toBeUndefined();
    expect(card.sqft).toBeUndefined();
  });
});

describe("fetchCountyParcels", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns real cards for a connected county (Wake)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => wakeParcelsJson }));
    const r = await fetchCountyParcels({ county: "Wake", address: "love", max: 25 });
    expect(r.status).toBe("connected");
    expect(r.cards.length).toBe(2);
    expect(r.cards[0].source_label).toBe("wake_tax_parcel");
  });

  it("returns not_connected for counties without a live feed", async () => {
    const r = await fetchCountyParcels({ county: "Mecklenburg", max: 25 });
    expect(r.status).toBe("not_connected");
    expect(r.cards).toEqual([]);
  });
});

describe("huntLeads", () => {
  let inserts: unknown[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    inserts = [];
  });

  function setup(fetchImpl?: () => Promise<unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        fetchImpl ?? (() => Promise.resolve({ ok: true, status: 200, json: async () => wakeParcelsJson }))
      )
    );
    const admin = makeAdminMock(inserts);
    vi.spyOn(apiHelpers, "createAdminClient").mockReturnValue(admin as never);
  }

  it("hunts real Wake tax parcels, scores, and inserts new deals", async () => {
    setup();
    const result = await huntLeads({ orgId: "org-1", counties: ["Wake"], maxPerCounty: 25 });
    expect(result.scanned).toBe(2);
    expect(result.newLeads).toBe(2);
    expect(result.duplicates).toBe(0);
    expect(inserts.length).toBe(2);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.stage).toBe("Lead");
    expect(row.source).toBe("county_gis");
    expect(row.notes).toContain("feasibility signal");
    expect(row.notes).toContain("Owner:");
  });

  it("warns when a county feed is not connected (Mecklenburg)", async () => {
    setup();
    const result = await huntLeads({ orgId: "org-1", counties: ["Mecklenburg"], maxPerCounty: 25 });
    expect(result.newLeads).toBe(0);
    expect(result.warnings.some((w) => w.includes("not connected"))).toBe(true);
  });

  it("reports unsupported counties as warnings", async () => {
    setup();
    const result = await huntLeads({ orgId: "org-1", counties: ["Avery"], maxPerCounty: 5 });
    expect(result.warnings.some((w) => w.includes("Unsupported county"))).toBe(true);
    expect(result.newLeads).toBe(0);
  });

  it("degrades to warnings when the county API fails", async () => {
    setup(() => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }));
    const result = await huntLeads({ orgId: "org-1", counties: ["Wake"], maxPerCounty: 5 });
    expect(result.newLeads).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("dedupes addresses already in the org", async () => {
    const selectResult = { data: [{ address: "7712 BILL LOVE RD" }], error: null };
    const builder = {
      from: () => builder,
      select: () => builder,
      insert: (row: unknown) => { inserts.push(row); return builder; },
      eq: () => builder,
      order: () => builder,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(selectResult)),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => wakeParcelsJson }));
    vi.spyOn(apiHelpers, "createAdminClient").mockReturnValue(builder as never);

    const result = await huntLeads({ orgId: "org-1", counties: ["Wake"], maxPerCounty: 25 });
    expect(result.duplicates).toBe(1);
    expect(result.newLeads).toBe(1);
    expect(inserts.length).toBe(1);
  });
});

describe("scoreListings", () => {
  it("scores real parcel cards", async () => {
    const cards = (await fetchCountyParcels({ county: "Wake", max: 25 })).cards;
    const scored = await scoreListings("Wake", cards);
    expect(scored[0].score.needsArv).toBe(true);
    expect(scored[0].score.attentionScore).toBeGreaterThanOrEqual(0);
  });
});
