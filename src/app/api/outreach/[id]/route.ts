import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { recordResponse } from "@/lib/outreach/engine";

type Params = { params: Promise<{ id: string }> };

const VALID_RESPONSES = new Set(["none", "no_interest", "counter", "accepted", "undeliverable"]);

export async function PUT(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    const { data: existing } = await admin.from("outreach").select("org_id").eq("id", id).single();
    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Mark a draft as actually sent (operator assertion — the row advances the
    // cadence). Honest: this never fabricates a provider confirmation; it records
    // that the operator sent it.
    if (body.status === "sent") {
      const { data, error } = await admin
        .from("outreach")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return NextResponse.json({ outreach: data });
    }

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
