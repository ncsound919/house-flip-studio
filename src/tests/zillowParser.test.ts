import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { parseZillowHtml } from "@/lib/listingSources/zillow";

describe("parseZillowHtml", () => {
  it("parses fixture with listings into ListingCard[]", () => {
    const html = readFileSync(
      path.resolve("src/tests/fixtures/zillowSample.html"),
      "utf-8"
    );
    const cards = parseZillowHtml(html, "Mecklenburg");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].source_label).toBe("zillow");
    expect(cards[0].source).toBe("api");
    // every result must carry the disclaimer
    for (const c of cards) {
      expect(c.disclaimer).toBe("Scraped data — stale. Confirm before acting. Not verified.");
    }
    // first card should have parsed fields
    expect(cards[0].address.length).toBeGreaterThan(0);
    expect(cards[0].county).toBe("Mecklenburg");
    if (cards.length >= 2) {
      expect(cards[1].address.length).toBeGreaterThan(0);
    }
  });

  it("returns empty array on empty fixture (no fake rows)", () => {
    const html = readFileSync(
      path.resolve("src/tests/fixtures/zillowEmpty.html"),
      "utf-8"
    );
    const cards = parseZillowHtml(html, "Wake");
    expect(cards).toEqual([]);
  });
});
