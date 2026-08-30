import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

const VALID_STATUSES = new Set(["approved", "pending", "rejected"]);

async function assertChangeOrderInOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  coId: string
) {
  const { data, error } = await admin
    .from("change_orders")
    .select(
      `id, rehab_item_id, rehab_items!inner ( org_id )`
    )
    .eq("id", coId)
    .single();

  type Row = {
    id: string;
    rehab_item_id: string;
    rehab_items: { org_id: string } | { org_id: string }[] | null;
  };

  const row = data as Row | null;
  if (error || !row) {
    throw new Error("Not found");
  }

  const item = Array.isArray(row.rehab_items) ? row.rehab_items[0] : row.rehab_items;
  if (!item || item.org_id !== orgId) {
    throw new Error("Not found");
  }
}

type RouteParams = { params: Promise<{ id: string; coId: string }> };

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { orgId } = await requireOrgId();
    const { coId } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    await assertChangeOrderInOrg(admin, orgId, coId);

    const updates: Record<string, unknown> = {};

    if ("status" in body) {
      if (!VALID_STATUSES.has(body.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      updates.status = body.status;
    }
    if ("description" in body) {
      updates.description = body.description.trim();
    }
    if ("cost_impact" in body) {
      updates.cost_impact = Number(body.cost_impact);
    }
    if ("reason" in body) {
      updates.reason = body.reason ? String(body.reason) : null;
    }

    const { data, error } = await admin
      .from("change_orders")
      .update(updates)
      .eq("id", coId)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ changeOrder: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    const { orgId } = await requireOrgId();
    const { coId } = await params;
    const admin = createAdminClient();

    await assertChangeOrderInOrg(admin, orgId, coId);

    const { error } = await admin
      .from("change_orders")
      .delete()
      .eq("id", coId);

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
