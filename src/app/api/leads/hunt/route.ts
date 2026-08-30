import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { huntLeads, type HuntResult } from "@/lib/leadHunt";

const DEFAULT_COUNTIES = ["Mecklenburg", "Wake", "Durham", "Guilford"];

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgId();

    let counties = DEFAULT_COUNTIES;
    try {
      const body = await request.json();
      if (Array.isArray(body?.counties) && body.counties.length > 0) {
        counties = body.counties;
      }
    } catch {
      // no body → default counties
    }

    const result: HuntResult = await huntLeads({
      orgId,
      counties,
      maxPerCounty: 25,
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
