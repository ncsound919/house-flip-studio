import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { approveAgentAction } from "@/lib/agent/runner";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const result = await approveAgentAction(id, orgId);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
