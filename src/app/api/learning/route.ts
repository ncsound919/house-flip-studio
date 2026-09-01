import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { getOrgSettings } from "@/lib/orgSettings";
import { syncLearning } from "@/lib/learning/sync";

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();

    const [{ data: lessons }, { data: outcomes }, { data: insights }] = await Promise.all([
      admin
        .from("learning_lessons")
        .select("id, agent_id, pattern, lesson, evidence_count, last_seen")
        .eq("org_id", orgId)
        .order("evidence_count", { ascending: false })
        .limit(50),
      admin
        .from("learning_outcomes")
        .select("kind, summary, detail, success, occurred_at")
        .eq("org_id", orgId)
        .order("occurred_at", { ascending: false })
        .limit(50),
      admin
        .from("market_insights")
        .select("metric, value, sample_size, window_start")
        .eq("org_id", orgId)
        .order("generated_at", { ascending: false })
        .limit(200),
    ]);

    return NextResponse.json({ lessons, outcomes, insights });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST() {
  try {
    const { orgId } = await requireOrgId();
    const settings = await getOrgSettings(orgId);
    const result = await syncLearning(orgId, settings.underwriting.rehabPerSqft);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
