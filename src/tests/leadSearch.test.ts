import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

// Mock auth — route requires requireOrgId() org check
vi.mock("@/lib/apiHelpers", () => ({
  requireOrgId: vi.fn().mockResolvedValue({ orgId: "org-123", userId: "user-123" }),
  createAdminClient: vi.fn(),
  requireUser: vi.fn().mockResolvedValue({ id: "user-123" }),
}));

import { POST } from "@/app/api/lead-search/route";

function mockFetchWithHtml(html: string, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    text: async () => html,
  });
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/lead-search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/lead-search", () => {
  const zillowSampleHtml = readFileSync(
    path.resolve("src/tests/fixtures/zillowSample.html"),
    "utf-8"
  );

  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("merges county_gis guidance + zillow listings, shape { results, warnings }", async () => {
    global.fetch = mockFetchWithHtml(zillowSampleHtml) as unknown as typeof fetch;

    const req = makeRequest({
      county: "Mecklenburg",
      address: "123 Main",
      sources: ["county_gis", "zillow"],
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty("results");
    expect(json).toHaveProperty("warnings");
    expect(Array.isArray(json.results)).toBe(true);
    expect(Array.isArray(json.warnings)).toBe(true);

    // Should have county_gis guidance card + zillow cards
    const gisCards = json.results.filter((c: { source: string }) => c.source === "county_gis");
    const zillowCards = json.results.filter((c: { source: string }) => c.source === "api");

    expect(gisCards.length).toBeGreaterThanOrEqual(1);
    expect(gisCards[0].source_label).toBe("county_gis");
    expect(gisCards[0].disclaimer).toBeDefined();

    expect(zillowCards.length).toBeGreaterThan(0);
    expect(zillowCards[0].source_label).toBe("zillow");
    expect(zillowCards[0].disclaimer).toMatch(/Scraped data/);
  });

  it("returns guidance fallback + zillow warning when zillow fetch fails (500)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "",
    }) as unknown as typeof fetch;

    const req = makeRequest({
      county: "Mecklenburg",
      address: "123 Main",
      sources: ["county_gis", "zillow"],
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    // county_gis guidance card still present
    expect(json.results.length).toBeGreaterThanOrEqual(1);
    const gisCards = json.results.filter((c: { source: string }) => c.source === "county_gis");
    expect(gisCards.length).toBeGreaterThanOrEqual(1);

    // warnings must mention zillow
    expect(json.warnings.join(" ").toLowerCase()).toContain("zillow");
  });

  it("all-empty zillow scrape yields results: [] + warnings containing zillow when only zillow requested and fetch fails", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "",
    }) as unknown as typeof fetch;

    const req = makeRequest({
      county: "Mecklenburg",
      address: "123 Main",
      sources: ["zillow"],
    });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.results).toEqual([]);
    expect(json.warnings.join(" ").toLowerCase()).toContain("zillow");
  });

  it("returns 401 when requireOrgId throws Unauthorized", async () => {
    const { requireOrgId } = await import("@/lib/apiHelpers");
    vi.mocked(requireOrgId).mockRejectedValueOnce(new Error("Unauthorized"));

    global.fetch = mockFetchWithHtml(zillowSampleHtml) as unknown as typeof fetch;

    const req = makeRequest({
      county: "Mecklenburg",
      address: "123 Main",
      sources: ["county_gis"],
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/Unauthorized/);
  });
});
