import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { createAdminClient } from "@/lib/apiHelpers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const pendingOnly = searchParams.get("pending") === "true";

    let query = admin
      .from("agent_actions")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (pendingOnly) {
      query = query.eq("status", "pending_approval").eq("requires_approval", true);
    }

    const { data: actions, error } = await query;
    if (error) throw error;

    const { data: runs } = await admin
      .from("agent_runs")
      .select("id, trigger, status, summary, started_at, finished_at")
      .eq("org_id", orgId)
      .order("started_at", { ascending: false })
      .limit(20);

    return NextResponse.json({ actions: actions ?? [], runs: runs ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
