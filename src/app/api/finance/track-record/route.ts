import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { loadTrackRecordForOrg } from "@/lib/finance/loadTrackRecord";

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const { rows, summary } = await loadTrackRecordForOrg(orgId);
    return NextResponse.json({ rows, summary });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
