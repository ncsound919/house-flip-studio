import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/apiHelpers";
import { recordResponse } from "@/lib/outreach/engine";

type Params = { params: Promise<{ id: string }> };

const VALID_RESPONSES = new Set(["none", "no_interest", "counter", "accepted", "undeliverable"]);

export async function PUT(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const body = await request.json();

    if (!VALID_RESPONSES.has(body.response)) {
      return NextResponse.json({ error: "Invalid response" }, { status: 400 });
    }

    const row = await recordResponse(orgId, id, body.response, body.response_note ?? null);
    return NextResponse.json({ outreach: row });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
