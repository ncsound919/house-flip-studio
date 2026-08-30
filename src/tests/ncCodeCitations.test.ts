import { describe, it, expect } from "vitest";
import { getCitationForTrade, listAllCitations } from "../lib/ncCodeCitations";

describe("getCitationForTrade", () => {
  it("returns citations for a known trade", () => {
    const electrical = getCitationForTrade("Electrical");
    expect(electrical.length).toBeGreaterThan(0);
    expect(electrical.every((c) => c.trade === "Electrical")).toBe(true);
  });

  it("returns empty array for an unknown trade", () => {
    expect(getCitationForTrade("Astrology")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(getCitationForTrade("")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(getCitationForTrade("electrical").length).toBe(
      getCitationForTrade("Electrical").length
    );
  });
});

describe("NCCodeCitation shape", () => {
  const all = listAllCitations();

  it("has required fields on every citation", () => {
    for (const c of all) {
      expect(typeof c.section).toBe("string");
      expect(c.section.length).toBeGreaterThan(0);
      expect(typeof c.title).toBe("string");
      expect(c.title.length).toBeGreaterThan(0);
      expect(typeof c.trade).toBe("string");
      expect(c.trade.length).toBeGreaterThan(0);
      expect(typeof c.summary).toBe("string");
    }
  });

  it("sections match the expected NC code format", () => {
    const sectionPattern = /^(NEC|NCRC|NCPC) [A-Z0-9.]+/;
    for (const c of all) {
      expect(c.section).toMatch(sectionPattern);
    }
  });

  it("covers all core trades", () => {
    const trades = new Set(all.map((c) => c.trade));
    for (const trade of [
      "Electrical",
      "Plumbing",
      "HVAC",
      "Structural",
      "Roofing",
      "General",
    ]) {
      expect(trades.has(trade), `missing trade: ${trade}`).toBe(true);
    }
  });
});
