import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/apiHelpers";
import { runAgentCycle } from "@/lib/agent/runner";
import { processJobs } from "@/lib/agent/queue";

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
  const results: {
    org: string;
    actions: number;
    moneyGatesAwaiting: number;
    errors: string[];
    jobsProcessed: number;
    jobErrors: string[];
  }[] = [];

  for (const org of orgs ?? []) {
    try {
      const result = await runAgentCycle({ orgId: org.id, trigger: "scheduled" });
      // Slow research (dossiers, comps) runs in the job queue, processed here so
      // the 30s cycle budget isn't consumed by external sources.
      const jobs = await processJobs(org.id);
      results.push({
        org: org.name ?? org.id,
        actions: result.actions,
        moneyGatesAwaiting: result.moneyGatesAwaiting,
        errors: result.errors,
        jobsProcessed: jobs.processed,
        jobErrors: jobs.errors,
      });
    } catch (err) {
      results.push({
        org: org.name ?? org.id,
        actions: 0,
        moneyGatesAwaiting: 0,
        errors: [err instanceof Error ? err.message : "unknown error"],
        jobsProcessed: 0,
        jobErrors: [],
      });
    }
  }

  return NextResponse.json({ ran: true, at: new Date().toISOString(), results });
}
