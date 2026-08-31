// Live integration test: calls huntLeads() against the real DB and real ArcGIS.
// Skips unless run with --env-file=.env.local (or env vars exported).
// Usage: node --env-file=.env.local npm run test -- src/tests/live_hunt.test.ts
import { describe, it, expect } from "vitest";
import { huntLeads } from "../lib/leadHunt";
import { createAdminClient } from "../lib/apiHelpers";

const hasSupabase = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;

describe.skipIf(!hasSupabase)("LIVE: huntLeads end-to-end", () => {
  it("huntLeads({counties:['Wake']}) returns real Wake parcels", async () => {
    // Find the Default Org
    const admin = createAdminClient();
    const { data: orgs, error: orgErr } = await admin
      .from("organizations")
      .select("id, name")
      .limit(1);
    expect(orgErr).toBeNull();
    expect(orgs).toBeTruthy();
    const orgId = orgs![0].id;
    console.log(`Using org: ${orgs![0].name} (${orgId})`);

    const start = Date.now();
    const result = await huntLeads({ orgId, counties: ["Wake"], maxPerCounty: 5 });
    const elapsed = Date.now() - start;
    console.log(`Elapsed: ${elapsed}ms`);
    console.log("Result:", JSON.stringify(result, null, 2));

    expect(elapsed).toBeLessThan(20_000);
    expect(result.scanned).toBeGreaterThan(0);
    expect(result.warnings).toBeDefined();
  }, 30_000);

  it("huntLeads() with all default counties", async () => {
    const admin = createAdminClient();
    const { data: orgs } = await admin.from("organizations").select("id").limit(1);
    const orgId = orgs![0].id;
    const start = Date.now();
    const result = await huntLeads({ orgId });
    const elapsed = Date.now() - start;
    console.log(`Elapsed: ${elapsed}ms`);
    console.log("Result:", JSON.stringify(result, null, 2));
    expect(elapsed).toBeLessThan(20_000);
  }, 30_000);
});
