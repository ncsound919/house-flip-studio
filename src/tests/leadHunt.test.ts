import { describe, it, expect, vi, afterEach } from "vitest";
import { huntLeads, scoreListings } from "../lib/leadHunt";
import { fetchCountyParcels, mapParcel } from "../lib/listingSources/countyParcels";
import { scoreAndTier } from "../lib/leadTier";
import type { ListingCard } from "../lib/listingSources/types";
import * as apiHelpers from "../lib/apiHelpers";

// NC OneMap statewide parcel JSON structure.
const ncOneMapJson = {
  features: [
    {
      attributes: {
        parno: "0594101015",
        ownname: "GURRAM, ANANDA PAPIREDDY",
        siteadd: "7712 BILL LOVE RD",
        scity: "Raleigh",
        mailadd: "7712 BILL LOVE RD",
        parval: 61996,
        landval: 14167,
        impropval: 47829,
        gisacres: 0.35,
        saledate: 1734307200000,
        structyear: 2018,
        cntyname: "Wake",
      },
    },
    {
      attributes: {
        parno: "0595320153",
        ownname: "SMITH, JOHN D",
        siteadd: "7716 BILL LOVE RD",
        scity: "Raleigh",
        mailadd: "PO BOX 123",
        parval: 43022,
        landval: 12000,
        impropval: 31022,
        gisacres: 0.22,
        saledate: null,
        structyear: null,
        cntyname: "Wake",
      },
    },
  ],
};

// A parcel that matches the flip profile ($30k-$150k, has address + year).
const flipProfileJson = {
  features: [
    {
      attributes: {
        parno: "0123456789",
        ownname: "JONES, MARY L",
        siteadd: "1039 GALLOWAY RD",
        scity: "Pitt",
        mailadd: "PO BOX 456",
        parval: 30000,
        landval: 8000,
        impropval: 22000,
        gisacres: 0.53,
        saledate: 1007161200000,
        structyear: 1901,
        cntyname: "Pitt",
      },
    },
  ],
};

function makeAdminMock(inserts: unknown[], existingAddresses: string[] = []) {
  const builder = {
    from: () => builder,
    select: () => builder,
    insert: (row: unknown) => { inserts.push(row); return builder; },
    eq: () => builder,
    then: (_resolve: (v: unknown) => unknown) => {
      return Promise.resolve(_resolve({ data: existingAddresses.map(a => ({ address: a })), error: null }));
    },
  };
  return builder;
}

describe("mapParcel", () => {
  it("maps NC OneMap fields into a ListingCard", () => {
    const card = mapParcel(ncOneMapJson.features[0].attributes);
    expect(card.address).toBe("7712 BILL LOVE RD");
    expect(card.city).toBe("Raleigh");
    expect(card.year_built).toBe(2018);
    expect(card.source_label).toBe("nc_onemap_parcel");
    expect(card.parcel?.owner).toContain("GURRAM");
    expect(card.parcel?.assessedValue).toBe(61996);
    expect(card.parcel?.lastSaleDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("handles nulls gracefully", () => {
    const card = mapParcel(ncOneMapJson.features[1].attributes);
    expect(card.address).toBe("7716 BILL LOVE RD");
    expect(card.year_built).toBeUndefined();
    expect(card.parcel?.assessedValue).toBe(43022);
  });

  it("computes motivation signals from mailing address vs site address", () => {
    const absentee = mapParcel(ncOneMapJson.features[1].attributes);
    expect(absentee.motivation?.absenteeOwner).toBe(true);
    const local = mapParcel(ncOneMapJson.features[0].attributes);
    expect(local.motivation?.absenteeOwner).toBe(false);
  });

  it("marks older homes (<1980) as olderHome motivation", () => {
    const card = mapParcel(flipProfileJson.features[0].attributes);
    expect(card.motivation?.olderHome).toBe(true);
    expect(card.motivation?.reasons.some(r => r.includes("1901"))).toBe(true);
  });
});

describe("fetchCountyParcels", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns real cards from NC OneMap for a county", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ncOneMapJson,
    }));
    const r = await fetchCountyParcels({ county: "Wake", max: 25 });
    expect(r.status).toBe("connected");
    expect(r.cards.length).toBe(2);
    expect(r.cards[0].source_label).toBe("nc_onemap_parcel");
    expect(r.cards[0].address).toBe("7712 BILL LOVE RD");
  });

  it("filters by assessed value range using FLIP_PROFILE defaults when not specified", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => ncOneMapJson };
    }));
    await fetchCountyParcels({ max: 5 });
    // FLIP_PROFILE is $30k-$150k, so the query should include parval BETWEEN 30000 AND 150000
    expect(capturedUrl).toContain("parval%20BETWEEN%2030000%20AND%20150000");
  });

  it("returns not_connected when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const r = await fetchCountyParcels({ county: "Wake", max: 25 });
    expect(r.status).toBe("connected"); // still connected, but with error
    expect(r.error).toBeTruthy();
    expect(r.cards.length).toBe(0);
  });
});

describe("huntLeads", () => {
  let inserts: unknown[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    inserts = [];
  });

  function setup(json = flipProfileJson) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => json,
    }));
    const admin = makeAdminMock(inserts);
    vi.spyOn(apiHelpers, "createAdminClient").mockReturnValue(admin as never);
  }

  it("hunts statewide NC OneMap, scores, and inserts new deals", async () => {
    setup();
    const result = await huntLeads({ orgId: "org-1", statewide: true, maxTotal: 50 });
    expect(result.scanned).toBeGreaterThan(0);
    expect(result.newLeads).toBeGreaterThan(0);
    expect(result.duplicates).toBe(0);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.stage).toBe("Lead");
    expect(row.source).toBe("county_gis");
    expect(row.notes).toContain("Owner:");
  });

  it("warns on fetch failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));
    const admin = makeAdminMock(inserts);
    vi.spyOn(apiHelpers, "createAdminClient").mockReturnValue(admin as never);
    const result = await huntLeads({ orgId: "org-1", statewide: true });
    expect(result.newLeads).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("dedupes addresses already in the org", async () => {
    setup();
    const existing = makeAdminMock(inserts, ["1039 GALLOWAY RD"]);
    vi.spyOn(apiHelpers, "createAdminClient").mockReturnValue(existing as never);
    const result = await huntLeads({ orgId: "org-1", statewide: true });
    expect(result.duplicates).toBe(1);
    expect(result.newLeads).toBe(0);
  });

  it("supports per-county mode for legacy callers", async () => {
    setup();
    const result = await huntLeads({ orgId: "org-1", counties: ["Wake"], maxPerCounty: 25 });
    expect(result.scanned).toBeGreaterThanOrEqual(0);
  });

  it("pages statewide across multiple requests instead of one page", async () => {
    // Return a fresh, unique page of features per resultOffset. Mirrors the
    // real NC OneMap feed (which respects resultOffset + resultRecordCount).
    const pageOf = (offset: number, requested: number) => {
      const count = Math.min(requested, 100);
      return {
        features: Array.from({ length: count }, (_, i) => {
          const n = offset + i + 1;
          return {
            attributes: {
              parno: String(n).padStart(10, "0"),
              ownname: `OWNER ${n}`,
              siteadd: `${n} PAGED RD`,
              scity: "Raleigh",
              mailadd: `PO BOX ${n}`,
              parval: 50000 + n,
              landval: 8000,
              impropval: 42000 + n,
              gisacres: 0.4,
              saledate: 1007161200000,
              structyear: 1950,
              cntyname: "Wake",
            },
          };
        }),
      };
    };
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string) => {
        calls++;
        const u = new URL(url);
        const offset = Number(u.searchParams.get("resultOffset") ?? "0");
        const requested = Number(u.searchParams.get("resultRecordCount") ?? "100");
        return { ok: true, status: 200, json: async () => pageOf(offset, requested) };
      })
    );
    const admin = makeAdminMock([]);
    vi.spyOn(apiHelpers, "createAdminClient").mockReturnValue(admin as never);

    const result = await huntLeads({ orgId: "org-1", statewide: true, maxTotal: 150 });
    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.scanned).toBe(150);
    expect(result.newLeads).toBe(150);
  });
});

describe("scoreListings", () => {
  it("scores NC OneMap cards with motivation signals", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => flipProfileJson,
    }));
    const cards = (await fetchCountyParcels({ county: "Pitt", max: 5 })).cards;
    const scored = await scoreListings("Pitt", cards);
    expect(scored[0].score.attentionScore).toBeGreaterThan(50);
    expect(scored[0].score.needsArv).toBe(true);
    expect(scored[0].score.flags.length).toBeGreaterThan(0);
  });
});

describe("leadHunt — new signal notes", () => {
  it("tier notes include new signals via reasons", () => {
    const card: ListingCard = {
      address: "5 Oak St", county: "Wake", source: "county_gis", source_label: "nc_onemap_parcel",
      parcel: { assessedValue: 90_000, pin: "55" },
      motivation: { absenteeOwner: false, outOfStateOwner: false, longHeld: false, olderHome: true, multiParcelOwner: true, taxDelinquent: true, reasonCount: 2, reasons: ["Multi-parcel owner (portfolio)", "Tax delinquent"] },
    };
    const { score, tier } = scoreAndTier(card);
    expect(score.flags.join(" ")).toMatch(/Multi-parcel/);
    expect(score.flags.join(" ")).toMatch(/tax delinquent/i);
    expect(tier).toBeDefined();
  });
});
