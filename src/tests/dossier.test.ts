import { describe, it, expect } from "vitest";
import { fetchCountyTaxRecord } from "../lib/research/sources/countyTax";
import { fetchRentcastProperty } from "../lib/research/sources/rentcast";

describe("research sources — graceful degradation", () => {
  it("countyTax returns a typed result, never throws", async () => {
    const r = await fetchCountyTaxRecord("123", { minAssessed: 30_000, maxAssessed: 150_000 });
    expect(["ok", "error"]).toContain(r.status);
  });

  it("rentcast returns error when no API key is configured", async () => {
    const prev = process.env.RENTCAST_API_KEY;
    delete process.env.RENTCAST_API_KEY;
    const r = await fetchRentcastProperty("123 Main St");
    expect(r.status).toBe("error");
    process.env.RENTCAST_API_KEY = prev;
  });
});