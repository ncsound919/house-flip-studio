import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/apiHelpers";
import { huntLeads } from "@/lib/leadHunt";

// Scheduled lead hunt — invoked by Vercel Cron (see vercel.json).
// No user session: uses the service role and hunts for the org(s) that exist.
// Guarded by CRON_SECRET when configured.

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
  const results: { org: string; found: number; warnings: string[] }[] = [];

  for (const org of orgs ?? []) {
    const result = await huntLeads({
      orgId: org.id,
      counties: ["Mecklenburg", "Wake", "Durham", "Guilford"],
      maxPerCounty: 25,
    });
    results.push({
      org: org.name ?? org.id,
      found: result.newLeads,
      warnings: result.warnings,
    });
  }

  return NextResponse.json({ ran: true, at: new Date().toISOString(), results });
}
