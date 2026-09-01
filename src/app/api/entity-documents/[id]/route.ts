import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

type Params = { params: Promise<{ id: string }> };

const VALID_STATUS = new Set(["missing", "requested", "received", "filed"]);

export async function PUT(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    const { data: existing } = await admin
      .from("entity_documents")
      .select("org_id, status")
      .eq("id", id)
      .single();
    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if ("status" in body) {
      if (!VALID_STATUS.has(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
      if (body.status === "received" || body.status === "filed") {
        updates.received_at = new Date().toISOString().slice(0, 10);
      }
    }
    if ("notes" in body) updates.notes = body.notes ?? null;
    if ("file_url" in body) updates.file_url = body.file_url ?? null;

    const { data, error } = await admin
      .from("entity_documents")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ document: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("entity_documents")
      .select("org_id")
      .eq("id", id)
      .single();
    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await admin.from("entity_documents").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
