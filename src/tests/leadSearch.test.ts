import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock auth — route requires requireOrgId() org check
vi.mock("@/lib/apiHelpers", () => ({
  requireOrgId: vi.fn().mockResolvedValue({ orgId: "org-123", userId: "user-123" }),
  createAdminClient: vi.fn(),
  requireUser: vi.fn().mockResolvedValue({ id: "user-123" }),
}));

import { POST } from "@/app/api/lead-search/route";

// Real ArcGIS parcel JSON shape (what Wake's FeatureServer returns)
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
        DEED_ACRES: 4.81,
      },
    },
  ],
};

function mockFetchJson(json: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => json,
  });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/lead-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/lead-search (real tax-record source)", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns real Wake tax parcels + guidance card", async () => {
    global.fetch = mockFetchJson(wakeParcelsJson) as unknown as typeof fetch;

    const req = makeRequest({
      county: "Wake",
      address: "love",
      sources: ["county_gis", "tax_records"],
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json.results)).toBe(true);
    expect(Array.isArray(json.warnings)).toBe(true);

    const parcelCards = json.results.filter((c: { source_label: string }) => c.source_label === "wake_tax_parcel");
    expect(parcelCards.length).toBe(1);
    expect(parcelCards[0].address).toBe("7712 BILL LOVE RD");
    expect(parcelCards[0].price).toBe(795000);
    expect(parcelCards[0].sqft).toBe(2163);
    expect(parcelCards[0].year_built).toBe(2018);
    expect(parcelCards[0].source).toBe("county_gis");
    expect(parcelCards[0].parcel?.owner).toContain("GURRAM");
    expect(parcelCards[0].parcel?.assessedValue).toBe(619967);

    // guidance card still present
    const gisCards = json.results.filter((c: { source_label: string }) => c.source_label === "county_gis");
    expect(gisCards.length).toBeGreaterThanOrEqual(1);
  });

  it("warns when county tax-record feed is not connected (e.g. Mecklenburg)", async () => {
    global.fetch = vi.fn() as unknown as typeof fetch; // should not be called

    const req = makeRequest({
      county: "Mecklenburg",
      address: "123 Main",
      sources: ["county_gis", "tax_records"],
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.warnings.join(" ").toLowerCase()).toContain("not connected");
    // guidance still present
    const gisCards = json.results.filter((c: { source_label: string }) => c.source_label === "county_gis");
    expect(gisCards.length).toBeGreaterThanOrEqual(1);
  });

  it("warns when the county API returns an error", async () => {
    global.fetch = mockFetchJson({ error: { message: "Layer locked" } }) as unknown as typeof fetch;

    const req = makeRequest({
      county: "Wake",
      address: "love",
      sources: ["tax_records"],
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.warnings.join(" ").toLowerCase()).toContain("error");
    expect(json.results).toEqual([]);
  });

  it("returns 401 when requireOrgId throws Unauthorized", async () => {
    const { requireOrgId } = await import("@/lib/apiHelpers");
    vi.mocked(requireOrgId).mockRejectedValueOnce(new Error("Unauthorized"));

    const req = makeRequest({
      county: "Wake",
      address: "love",
      sources: ["county_gis"],
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Unauthorized/);
  });
});
