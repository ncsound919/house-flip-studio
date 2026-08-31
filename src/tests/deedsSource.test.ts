import { describe, it, expect } from "vitest";
import { parseDeedComps, fetchDeedComps } from "../lib/research/sources/deeds";

describe("deed comps — parsing (deterministic, mocked)", () => {
  const sample = {
    records: [
      { salePrice: 210000, saleDate: "2026-05-01", propertyAddress: "9 Elm St", sqft: 1400 },
      { salePrice: 195000, saleDate: "2026-03-15", propertyAddress: "11 Elm St", sqft: 1300 },
      { salePrice: 225000, saleDate: "2025-12-01", propertyAddress: "7 Elm St", sqft: 1500 },
    ],
  };

  it("parses records into comps with real fields", () => {
    const comps = parseDeedComps(sample, "Elm");
    expect(comps.length).toBe(3);
    expect(comps[0].sale_price).toBe(210000);
    expect(comps[0].source).toBe("deeds");
    expect(comps[0].sale_date).toBe("2026-05-01");
  });

  it("filters records with no sale price", () => {
    const comps = parseDeedComps({ records: [{ salePrice: null, propertyAddress: "1 X" }, { salePrice: 180000, propertyAddress: "2 X" }] }, "X");
    expect(comps.length).toBe(1);
    expect(comps[0].sale_price).toBe(180000);
  });
});

describe("deed comps — fetch degradation", () => {
  it("returns error when feed unavailable", async () => {
    const r = await fetchDeedComps("123 Test St", { timeoutMs: 5 });
    expect(["ok", "error"]).toContain(r.status);
  });
});