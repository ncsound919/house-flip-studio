import { NextResponse } from "next/server";
import { requireOrgId, createAdminClient } from "@/lib/apiHelpers";
import { verifyContractor } from "@/lib/contractorVerification";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let orgId: string;
  try {
    const ctx = await requireOrgId();
    orgId = ctx.orgId;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contractor_id =
    typeof body.contractor_id === "string" ? body.contractor_id.trim() : "";

  if (!contractor_id) {
    return NextResponse.json({ error: "contractor_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await verifyContractor(admin, orgId, contractor_id);

  if (!result.verified) {
    return NextResponse.json({
      verified: false,
      reason: result.detail,
      detail: result.detail,
      checked_at: result.checkedAt,
      licenseTier: result.licenseTier,
    });
  }

  return NextResponse.json({
    verified: true,
    detail: result.detail,
    licenseTier: result.licenseTier,
    checked_at: result.checkedAt,
  });
}