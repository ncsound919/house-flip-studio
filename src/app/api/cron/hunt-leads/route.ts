import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/apiHelpers";
import { huntLeads } from "@/lib/leadHunt";
import { getOrgSettings } from "@/lib/orgSettings";

// Scheduled lead hunt — invoked by Vercel Cron (see vercel.json).
// No user session: uses the service role and hunts for the org(s) that exist.
// Guarded by CRON_SECRET when configured.
//
// Uses each org's flip profile (budget band, counties, hunt cap) from settings.

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id, name").limit(10);
  const results: {
    org: string;
    found: number;
    scanned: number;
    summary: { county: string; houses: number }[];
    warnings: string[];
  }[] = [];

  for (const org of orgs ?? []) {
    try {
      const settings = await getOrgSettings(org.id);
      if (!settings.flipProfile.statewide && settings.flipProfile.counties.length === 0) continue;
      const result = await huntLeads({
        orgId: org.id,
        statewide: settings.flipProfile.statewide,
        counties: settings.flipProfile.counties,
        maxTotal: settings.flipProfile.maxHuntPerRun,
        settings,
      });
      results.push({
        org: org.name ?? org.id,
        found: result.newLeads,
        scanned: result.scanned,
        summary: result.summary,
        warnings: result.warnings,
      });
    } catch (err) {
      // One org's failure must never abort the rest of the cron sweep.
      results.push({
        org: org.name ?? org.id,
        found: 0,
        scanned: 0,
        summary: [],
        warnings: [err instanceof Error ? err.message : "hunt failed"],
      });
    }
  }

  return NextResponse.json({ ran: true, at: new Date().toISOString(), results });
}
