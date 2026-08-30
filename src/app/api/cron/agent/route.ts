import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/apiHelpers";
import { runAgentCycle } from "@/lib/agent/runner";

// Scheduled autonomous agent run — invoked by Vercel Cron (see vercel.json).
// Guarded by CRON_SECRET. Runs across all orgs.

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = request.headers.get("authorization");
    if (header !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  const { data: orgs } = await admin.from("organizations").select("id, name").limit(50);
  const results: { org: string; actions: number; moneyGatesAwaiting: number; errors: string[] }[] = [];

  for (const org of orgs ?? []) {
    try {
      const result = await runAgentCycle({ orgId: org.id, trigger: "scheduled" });
      results.push({
        org: org.name ?? org.id,
        actions: result.actions,
        moneyGatesAwaiting: result.moneyGatesAwaiting,
        errors: result.errors,
      });
    } catch (err) {
      results.push({
        org: org.name ?? org.id,
        actions: 0,
        moneyGatesAwaiting: 0,
        errors: [err instanceof Error ? err.message : "unknown error"],
      });
    }
  }

  return NextResponse.json({ ran: true, at: new Date().toISOString(), results });
}
