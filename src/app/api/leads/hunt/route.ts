import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { huntLeads, type HuntResult } from "@/lib/leadHunt";
import { getOrgSettings } from "@/lib/orgSettings";

// Uses the org's flip profile (budget band, counties, hunt cap).
// Body may override with { counties: [...] } to restrict to a region.

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgId();
    const settings = await getOrgSettings(orgId);

    let statewide = settings.flipProfile.statewide;
    let counties: string[] | undefined = settings.flipProfile.counties;
    let maxTotal = settings.flipProfile.maxHuntPerRun;
    try {
      const body = await request.json();
      if (Array.isArray(body?.counties) && body.counties.length > 0) {
        statewide = false;
        counties = body.counties;
      }
      if (typeof body?.maxTotal === "number" && body.maxTotal > 0) {
        maxTotal = Math.min(body.maxTotal, 500);
      }
    } catch {
      // no body → org flip profile
    }

    const result: HuntResult = await huntLeads({
      orgId,
      statewide,
      counties,
      maxTotal,
      settings,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}