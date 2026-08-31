import { describe, it, expect } from "vitest";
import { fetchCountyTaxRecord } from "../lib/research/sources/countyTax";
import { fetchRentcastProperty } from "../lib/research/sources/rentcast";
import { compileDossier } from "../lib/research/dossier";

describe("compileDossier", () => {
  it("aggregates source results with per-source status", async () => {
    const d = await compileDossier({
      dealId: "d1",
      address: "123 Test St",
      pin: "123",
      profile: { minAssessed: 30_000, maxAssessed: 150_000 },
    });
    expect(d.dealId).toBe("d1");
    expect(Array.isArray(d.sources)).toBe(true);
    expect(d.sources.length).toBeGreaterThan(0);
    for (const s of d.sources) {
      expect(["ok", "error"]).toContain(s.status);
      expect(s.fetchedAt).toBeTruthy();
    }
  }, 35_000);
});

describe("research sources — graceful degradation", () => {
  it("countyTax returns a typed result, never throws", async () => {
    const r = await fetchCountyTaxRecord("123", { minAssessed: 30_000, maxAssessed: 150_000 });
    expect(["ok", "error"]).toContain(r.status);
  }, 35_000);

  it("rentcast returns error when no API key is configured", async () => {
    const prev = process.env.RENTCAST_API_KEY;
    delete process.env.RENTCAST_API_KEY;
    const r = await fetchRentcastProperty("123 Main St");
    expect(r.status).toBe("error");
    process.env.RENTCAST_API_KEY = prev;
  });
});