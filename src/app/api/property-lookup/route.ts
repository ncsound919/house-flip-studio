import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { lookupPropertyByAddress, getCountyGuidance, listSupportedCounties } from "@/lib/countyGis";

export async function POST(request: Request) {
  try {
    await requireOrgId();
    const body = await request.json();

    const address = typeof body.address === "string" ? body.address : "";
    const county = typeof body.county === "string" ? body.county : "";

    const guidance = getCountyGuidance(county);
    if (!guidance) {
      return NextResponse.json(
        {
          error: "Unsupported county",
          supported: listSupportedCounties(),
        },
        { status: 400 }
      );
    }

    const result = await lookupPropertyByAddress(address, county);
    if (!result) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
