import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/apiHelpers", () => ({
  requireOrgId: vi.fn().mockResolvedValue({ orgId: "org-123", userId: "user-123" }),
  createAdminClient: vi.fn(),
  requireUser: vi.fn().mockResolvedValue({ id: "user-123" }),
}));

vi.mock("@/lib/orgSettings", () => ({
  getOrgSettings: vi.fn().mockResolvedValue({
    flipProfile: { minAssessed: 30000, maxAssessed: 150000, statewide: true, counties: [], maxHuntPerRun: 200 },
    underwriting: { rehabPerSqft: 40, holdingMonths: 6, downPaymentPct: 20, interestRate: 10, loanPoints: 0 },
    agent: { enabled: true, huntOnCycle: true, maxHuntPerCycle: 100 },
    llm: { generateScopes: true },
  }),
  saveOrgSettings: vi.fn(),
}));

import { POST } from "@/app/api/lead-search/route";

// NC OneMap statewide parcel JSON shape.
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
  ],
};

function mockFetchJson(json: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({ ok, status, json: async () => json });
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

  beforeEach(() => { originalFetch = global.fetch; vi.clearAllMocks(); });
  afterEach(() => { global.fetch = originalFetch; vi.clearAllMocks(); });

  it("returns real NC OneMap parcels with correct fields", async () => {
    global.fetch = mockFetchJson(ncOneMapJson) as unknown as typeof fetch;

    const req = makeRequest({ county: "Wake", address: "love", sources: ["county_gis", "tax_records"] });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(Array.isArray(json.results)).toBe(true);
    expect(Array.isArray(json.warnings)).toBe(true);

    const parcelCards = json.results.filter(
      (c: { source_label: string }) => c.source_label === "nc_onemap_parcel"
    );
    expect(parcelCards.length).toBe(1);
    expect(parcelCards[0].address).toBe("7712 BILL LOVE RD");
    expect(parcelCards[0].year_built).toBe(2018);
    expect(parcelCards[0].source).toBe("county_gis");
    expect(parcelCards[0].parcel?.owner).toContain("GURRAM");
    expect(parcelCards[0].parcel?.assessedValue).toBe(61996);
  });

  it("returns guidance card when county GIS feed is reachable", async () => {
    global.fetch = mockFetchJson(ncOneMapJson) as unknown as typeof fetch;
    const req = makeRequest({ county: "Wake", sources: ["county_gis"] });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    // guidance card from county_gis provider
    const gisCards = json.results.filter((c: { source_label: string }) => c.source_label === "county_gis");
    expect(gisCards.length).toBeGreaterThanOrEqual(1);
  });

  it("warns when the NC OneMap API returns an error", async () => {
    global.fetch = mockFetchJson({ error: { message: "Layer locked" } }) as unknown as typeof fetch;

    const req = makeRequest({ county: "Wake", address: "love", sources: ["tax_records"] });
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.warnings.join(" ").toLowerCase()).toContain("error");
    expect(json.results).toEqual([]);
  });

  it("returns 401 when requireOrgId throws Unauthorized", async () => {
    const { requireOrgId } = await import("@/lib/apiHelpers");
    vi.mocked(requireOrgId).mockRejectedValueOnce(new Error("Unauthorized"));

    const req = makeRequest({ county: "Wake", sources: ["county_gis"] });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Unauthorized/);
  });
});
