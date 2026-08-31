import { createAdminClient } from "@/lib/apiHelpers";
import { compileDossier } from "@/lib/research/dossier";
import { getOrgSettings } from "@/lib/orgSettings";

// Async job queue for slow research work (dossiers, comps, exit predictions).
// The 30s cron budget is for the planner/runner cycle; anything that blocks on
// external sources goes here and is processed separately by the cron.

export type AgentJobKind = "fetch_dossier" | "fetch_comps" | "predict_exit";
export type AgentJobStatus = "pending" | "running" | "done" | "failed";

export interface AgentJob {
  id: string;
  org_id: string;
  deal_id: string | null;
  kind: AgentJobKind;
  payload: Record<string, unknown>;
  status: AgentJobStatus;
  attempts: number;
  error: string | null;
  created_at: string;
}

export async function enqueueJob(
  orgId: string,
  kind: AgentJobKind,
  dealId: string | null,
  payload: Record<string, unknown> = {}
): Promise<{ ok: boolean; reason?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from("agent_jobs").insert({
    org_id: orgId,
    deal_id: dealId,
    kind,
    payload,
    status: "pending",
    attempts: 0,
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

// Dedup: don't queue the same kind for the same deal twice.
export async function hasPendingJob(
  orgId: string,
  kind: AgentJobKind,
  dealId: string | null
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_jobs")
    .select("id")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .eq("deal_id", dealId ?? "")
    .in("status", ["pending", "running"]);
  return (data ?? []).length > 0;
}

// Process pending jobs for an org, oldest first. Runs in the cron separately
// from the planner cycle so slow research never blows the 30s cycle budget.
// A failing job is marked failed with the error; the rest still process.
export async function processJobs(
  orgId: string,
  limit = 5
): Promise<{ processed: number; errors: string[] }> {
  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from("agent_jobs")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  const errors: string[] = [];
  let processed = 0;
  for (const job of (jobs ?? []) as AgentJob[]) {
    await admin
      .from("agent_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id);
    try {
      if (job.kind === "fetch_dossier") {
        const settings = await getOrgSettings(orgId);
        const profile = settings.flipProfile;
        const dossier = await compileDossier({
          dealId: job.deal_id ?? "",
          address: String(job.payload.address ?? ""),
          pin: job.payload.pin ? String(job.payload.pin) : undefined,
          profile: { minAssessed: profile.minAssessed, maxAssessed: profile.maxAssessed },
        });
        await admin.from("dossiers").upsert(
          {
            org_id: orgId,
            deal_id: job.deal_id,
            sources: dossier.sources,
            compiled_at: dossier.compiledAt,
          },
          { onConflict: "deal_id" }
        );
      }
      await admin
        .from("agent_jobs")
        .update({ status: "done", finished_at: new Date().toISOString() })
        .eq("id", job.id);
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "job failed";
      errors.push(msg);
      await admin
        .from("agent_jobs")
        .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
        .eq("id", job.id);
    }
  }
  return { processed, errors };
}