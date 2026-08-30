import { NextResponse } from "next/server";
import { requireOrgId, createAdminClient } from "@/lib/apiHelpers";
import { verifyOnNclbgc } from "@/lib/contractorSources/nclbgc";

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

  const { data: contractor, error } = await admin
    .from("contractors")
    .select("id, org_id, license_number")
    .eq("id", contractor_id)
    .single();

  if (error || !contractor) {
    return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
  }

  if (contractor.org_id !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const licenseNumber =
    typeof contractor.license_number === "string" ? contractor.license_number.trim() : "";

  if (!licenseNumber) {
    const checked_at = new Date().toISOString();
    return NextResponse.json({
      verified: false,
      reason: "no license_number on contractor",
      detail: "no license_number on contractor",
      checked_at,
    });
  }

  let result: { verified: boolean; detail?: string; licenseTier?: string };
  try {
    result = await verifyOnNclbgc(licenseNumber);
  } catch {
    result = { verified: false, detail: "nclbgc unavailable, verify manually" };
  }

  const checked_at = new Date().toISOString();

  if (result.verified) {
    // Update verified_at — org-scoped for safety. Do not block response on update failure.
    try {
      const { error: updateError } = await admin
        .from("contractors")
        .update({ verified_at: checked_at })
        .eq("id", contractor_id)
        .eq("org_id", orgId);

      // If optional column update fails (e.g. migration not applied), surface reasoning but still return verified:true
      if (updateError) {
        return NextResponse.json({
          verified: true,
          detail: result.detail,
          licenseTier: result.licenseTier,
          checked_at,
          warning: "verified but failed to persist verified_at",
        });
      }
    } catch {
      // swallow persistence error — verification itself succeeded
    }

    return NextResponse.json({
      verified: true,
      detail: result.detail,
      licenseTier: result.licenseTier,
      checked_at,
    });
  }

  // Honesty guardrail: on any ambiguity / throttle / inactive -> verified:false, never green badge
  const reason = result.detail || "nclbgc unavailable, verify manually";
  return NextResponse.json({
    verified: false,
    reason,
    detail: result.detail ?? reason,
    checked_at,
    licenseTier: result.licenseTier,
  });
}
