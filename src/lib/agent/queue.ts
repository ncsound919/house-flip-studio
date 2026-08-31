import { createAdminClient } from "@/lib/apiHelpers";

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