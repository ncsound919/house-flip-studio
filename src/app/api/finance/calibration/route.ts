import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { getOrgSettings } from "@/lib/orgSettings";
import { loadCalibrationForOrg } from "@/lib/finance/loadCalibration";

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const settings = await getOrgSettings(orgId);
    const baseline = settings.underwriting.rehabPerSqft;
    const package_ = await loadCalibrationForOrg(orgId, baseline);
    return NextResponse.json(package_);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
