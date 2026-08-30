import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { runAgentCycle } from "@/lib/agent/runner";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { orgId } = await requireOrgId();
    const result = await runAgentCycle({ orgId, trigger: "manual" });
    return NextResponse.json({
      runId: result.runId,
      actions: result.actions,
      moneyGatesAwaiting: result.moneyGatesAwaiting,
      errors: result.errors,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Run failed" },
      { status: 500 }
    );
  }
}
