import { describe, it, expect, vi, afterEach } from "vitest";
import { huntLeads, scoreListings } from "../lib/leadHunt";
import { parseZillowHtml } from "../lib/listingSources/zillow";
import * as apiHelpers from "../lib/apiHelpers";

// zillow fixture matching the real parser contract
const sampleHtml = `
<html><body>
  <article class="property-card">
    <a class="property-card-link" href="/homedetails/100-New-St-Charlotte-NC/1234_zpid">100 New Street, Charlotte, NC 28202</a>
    <span>$250,000</span>
    <span>3 bds</span>
    <span>2 ba</span>
    <span>1,600 sqft</span>
    <span>Built in 1995</span>
    <img src="https://example.com/p1.jpg" />
  </article>
  <article class="property-card">
    <a class="property-card-link" href="/homedetails/999-Old-St-Charlotte-NC/5678_zpid">999 Old Street, Charlotte, NC 28202</a>
    <span>$450,000</span>
    <span>4 bds</span>
    <span>3 ba</span>
    <span>2,000 sqft</span>
    <img src="https://example.com/p2.jpg" />
  </article>
</body></html>`;

// Build a mock admin client chain. Every method returns the same thenable so
// both `await client.from(...).select(...)` and `await client.from(...).insert(...)`
// resolve. Inserts return the object so we can count them.
function makeAdminMock(inserts: unknown[]) {
  const selectResult = { data: [], error: null };
  const builder = {
    from: () => builder,
    select: () => builder,
    insert: (row: unknown) => {
      inserts.push(row);
      return builder;
    },
    eq: () => builder,
    single: () => builder,
    order: () => builder,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve(selectResult)),
  };
  return builder;
}

describe("parseZillowHtml + scoreListings", () => {
  it("parses fixture into ListingCard with disclaimer", () => {
    const cards = parseZillowHtml(sampleHtml, "Mecklenburg");
    expect(cards.length).toBe(2);
    expect(cards[0].source_label).toBe("zillow");
    expect(cards[0].source).toBe("api");
    expect(cards[0].price).toBe(250000);
    expect(cards[0].beds).toBe(3);
    expect(cards[0].disclaimer).toContain("Scraped data");
  });

  it("scores parsed listings with a feasibility signal", async () => {
    const cards = parseZillowHtml(sampleHtml, "Mecklenburg");
    const scored = await scoreListings("Mecklenburg", cards);
    expect(scored.length).toBe(2);
    expect(scored[0].score.attentionScore).toBeGreaterThanOrEqual(0);
    expect(scored[0].score.needsArv).toBe(true);
  });
});

describe("huntLeads", () => {
  let inserts: unknown[] = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    inserts = [];
  });

  function setup(fetchImpl?: () => Promise<unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        fetchImpl ??
          (() => Promise.resolve({ ok: true, text: () => Promise.resolve(sampleHtml) }))
      )
    );
    const admin = makeAdminMock(inserts);
    vi.spyOn(apiHelpers, "createAdminClient").mockReturnValue(admin as never);
  }

  it("hunts leads, scores them, and inserts new deals", async () => {
    setup();
    const result = await huntLeads({ orgId: "org-1", counties: ["Mecklenburg"], maxPerCounty: 25 });
    expect(result.scanned).toBe(2);
    expect(result.newLeads).toBe(2);
    expect(result.duplicates).toBe(0);
    // Two rows inserted with source api, stage Lead, and notes explaining the score is a signal.
    expect(inserts.length).toBe(2);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.stage).toBe("Lead");
    expect(row.source).toBe("api");
    expect(row.notes).toContain("feasibility signal");
  });

  it("dedupes addresses already in the org", async () => {
    // Pre-seed the "known" list by making select return one address.
    const selectResult = { data: [{ address: "100 New Street, Charlotte, NC 28202" }], error: null };
    const builder = {
      from: () => builder,
      select: () => builder,
      insert: (row: unknown) => { inserts.push(row); return builder; },
      eq: () => builder,
      order: () => builder,
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(selectResult)),
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(sampleHtml) }));
    vi.spyOn(apiHelpers, "createAdminClient").mockReturnValue(builder as never);

    const result = await huntLeads({ orgId: "org-1", counties: ["Mecklenburg"], maxPerCounty: 25 });
    expect(result.scanned).toBe(2);
    expect(result.duplicates).toBe(1); // "100 New Street" already known
    expect(result.newLeads).toBe(1);
    expect(inserts.length).toBe(1);
  });

  it("reports unsupported counties as warnings", async () => {
    setup();
    const result = await huntLeads({ orgId: "org-1", counties: ["Avery"], maxPerCounty: 5 });
    expect(result.warnings.some((w) => w.includes("Unsupported county"))).toBe(true);
    expect(result.newLeads).toBe(0);
  });

  it("degrades to warnings when zillow fetch fails", async () => {
    setup(() => Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve("") }));
    const result = await huntLeads({ orgId: "org-1", counties: ["Mecklenburg"], maxPerCounty: 5 });
    expect(result.newLeads).toBe(0);
  });
});
