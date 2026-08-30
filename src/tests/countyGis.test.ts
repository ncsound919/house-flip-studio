import { describe, it, expect } from "vitest";
import { lookupPropertyByAddress, getCountyGuidance } from "../lib/countyGis";

describe("getCountyGuidance", () => {
  it("returns guidance for Mecklenburg", () => {
    const g = getCountyGuidance("Mecklenburg");
    expect(g).toBeTruthy();
    expect(g!.county).toBe("Mecklenburg");
    expect(g!.portalUrl).toContain("mecklenburg");
    expect(g!.fields.length).toBeGreaterThan(0);
  });

  it("returns guidance for Wake, Durham, and Guilford", () => {
    for (const c of ["Wake", "Durham", "Guilford"]) {
      const g = getCountyGuidance(c);
      expect(g).toBeTruthy();
      expect(g!.portalUrl.length).toBeGreaterThan(0);
    }
  });

  it("returns null for an unknown county", () => {
    expect(getCountyGuidance("Avery")).toBeNull();
  });
});

describe("lookupPropertyByAddress", () => {
  it("returns a guided result for a Mecklenburg address", async () => {
    const result = await lookupPropertyByAddress("123 Main St", "Mecklenburg");
    expect(result).toBeTruthy();
    expect(result?.county).toBe("Mecklenburg");
    // Honest: data is not fabricated — fields are empty until manually entered.
    expect(result?.source).toBe("county_gis");
    expect(result?.data).toBeTruthy();
  });

  it("returns null for an unknown county", async () => {
    const result = await lookupPropertyByAddress("123 Main St", "Unknown County");
    expect(result).toBeNull();
  });

  it("returns null for an empty address", async () => {
    const result = await lookupPropertyByAddress("", "Mecklenburg");
    expect(result).toBeNull();
  });
});
