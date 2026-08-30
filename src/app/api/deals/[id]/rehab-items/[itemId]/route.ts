import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { REHAB_TRADES } from "@/lib/types";

type Params = { params: Promise<{ id: string; itemId: string }> };

const VALID_STATUS = new Set(["estimated", "contracted", "in_progress", "completed"]);

export async function PUT(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id, itemId } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    // Item must belong to this deal in this org.
    const { data: existing } = await admin
      .from("rehab_items")
      .select("org_id, deal_id")
      .eq("id", itemId)
      .single();
    if (!existing || existing.org_id !== orgId || existing.deal_id !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    for (const key of ["description", "trade", "contractor_id", "notes"]) {
      if (key in body) updates[key] = body[key] ?? null;
    }
    if ("estimated_cost" in body) updates.estimated_cost = Number(body.estimated_cost) || 0;
    if ("actual_cost" in body) updates.actual_cost = Number(body.actual_cost) || 0;
    if ("status" in body) {
      if (!VALID_STATUS.has(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
    }

    const { data, error } = await admin
      .from("rehab_items")
      .update(updates)
      .eq("id", itemId)
      .select("*, contractors(name)")
      .single();

    if (error) throw error;
    return NextResponse.json({ item: data });
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
    const { id, itemId } = await params;
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("rehab_items")
      .select("org_id, deal_id")
      .eq("id", itemId)
      .single();
    if (!existing || existing.org_id !== orgId || existing.deal_id !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await admin.from("rehab_items").delete().eq("id", itemId);
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
