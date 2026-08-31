import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchCountyParcels, rotationOrderBy } from "../lib/listingSources/countyParcels";

describe("rotationOrderBy", () => {
  it("orders by parval ASC on even day-of-year", () => {
    // Jan 2 is day-of-year 2 (even)
    expect(rotationOrderBy(new Date(2026, 0, 2))).toBe("parval ASC");
  });

  it("orders by structyear DESC on odd day-of-year", () => {
    // Jan 1 is day-of-year 1 (odd)
    expect(rotationOrderBy(new Date(2026, 0, 1))).toBe("structyear DESC");
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
});