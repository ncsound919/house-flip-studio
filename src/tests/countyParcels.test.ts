import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCountyParcels, rotationOrderBy } from "../lib/listingSources/countyParcels";

describe("rotationOrderBy", () => {
  it("rotates deterministically through cheap/old/low-improvement orderings", () => {
    // dayOfYear(Jan 1 2026)=1 → 1 % 3 = 1 → oldest first
    expect(rotationOrderBy(new Date(2026, 0, 1))).toBe("structyear ASC");
    // dayOfYear(Jan 2 2026)=2 → 2 % 3 = 2 → lowest building value first
    expect(rotationOrderBy(new Date(2026, 0, 2))).toBe("improvval ASC");
    // dayOfYear(Jan 3 2026)=3 → 3 % 3 = 0 → cheapest assessed first
    expect(rotationOrderBy(new Date(2026, 0, 3))).toBe("parval ASC");
  });

  it("covers the full rotation cycle and nothing else", () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 30; day++) {
      seen.add(rotationOrderBy(new Date(2026, 0, day)));
    }
    expect([...seen].sort()).toEqual(["improvval ASC", "parval ASC", "structyear ASC"]);
  });

  it("is deterministic (same date → same order)", () => {
    const a = rotationOrderBy(new Date(2026, 5, 15));
    const b = rotationOrderBy(new Date(2026, 5, 15));
    expect(a).toBe(b);
  });
});

describe("fetchCountyParcels pagination", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes resultOffset and the rotated orderByFields in the query", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => ({ features: [] }) };
    }));
    const r = await fetchCountyParcels({ max: 5, offset: 400 });
    expect(r.error).toBeFalsy();
    expect(capturedUrl).toContain("resultOffset=400");
    expect(capturedUrl).toContain("orderByFields=");
  });

  it("defaults offset to 0", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => ({ features: [] }) };
    }));
    await fetchCountyParcels({ max: 5 });
    expect(capturedUrl).toContain("resultOffset=0");
  });

  it("filters to improved parcels (struct = 'Y') to cut vacant land", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => ({ features: [] }) };
    }));
    await fetchCountyParcels({ max: 5 });
    expect(decodeURIComponent(capturedUrl)).toContain("struct = 'Y'");
  });

  it("never requests fields that don't exist on the live layer (ownercount/taxdelinquent)", async () => {
    let capturedUrl = "";
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return { ok: true, status: 200, json: async () => ({ features: [] }) };
    }));
    await fetchCountyParcels({ max: 5 });
    const decoded = decodeURIComponent(capturedUrl);
    expect(decoded).not.toContain("ownercount");
    expect(decoded).not.toContain("taxdelinquent");
    for (const f of ["struct", "structno", "subdivisio", "reviseyear", "owntype"]) {
      expect(decoded).toContain(f);
    }
  });
});