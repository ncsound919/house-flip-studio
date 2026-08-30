import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

export interface ChangeOrder {
  id: string;
  rehab_item_id: string;
  description: string;
  cost_impact: number;
  reason: string | null;
  status: "approved" | "pending" | "rejected";
  created_at: string;
  rehab_items?: { id: string; description: string } | null;
}

type Params = { params: Promise<{ id: string }> };

const VALID_STATUS = new Set(["approved", "pending", "rejected"]);

async function assertDealInOrg(admin: ReturnType<typeof createAdminClient>, orgId: string, id: string) {
  const { data, error } = await admin
    .from("deals")
    .select("org_id")
    .eq("id", id)
    .single();
  if (error || !data || data.org_id !== orgId) {
    throw new Error("Not found");
  }
}

// Change orders belong to rehab items, which belong to a deal. [id] = deal id.
export async function GET(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();

    await assertDealInOrg(admin, orgId, id);

    const { searchParams } = new URL(request.url);
    const rehabItemId = searchParams.get("rehab_item_id");

    const { data: items } = await admin
      .from("rehab_items")
      .select("id")
      .eq("deal_id", id);
    const itemIds = (items ?? []).map((i: { id: string }) => i.id);

    let query = admin
      .from("change_orders")
      .select("*, rehab_items(id, description)");
    if (rehabItemId) {
      query = query.eq("rehab_item_id", rehabItemId);
    } else if (itemIds.length) {
      query = query.in("rehab_item_id", itemIds);
    }

    const { data, error } = itemIds.length || rehabItemId
      ? await query.order("created_at", { ascending: false })
      : { data: [], error: null };

    if (error) throw error;
    return NextResponse.json({ changeOrders: data as ChangeOrder[] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    await assertDealInOrg(admin, orgId, id);

    const rehabItemId = String(body.rehab_item_id ?? "");
    // The rehab item must belong to this deal + org.
    const { data: item } = await admin
      .from("rehab_items")
      .select("id, deal_id, actual_cost")
      .eq("id", rehabItemId)
      .eq("deal_id", id)
      .single();
    if (!item) {
      return NextResponse.json({ error: "Rehab item not found on this deal" }, { status: 400 });
    }

    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!description) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }
    if (!VALID_STATUS.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("change_orders")
      .insert({
        rehab_item_id: rehabItemId,
        description,
        cost_impact: Number(body.cost_impact) || 0,
        reason: body.reason ?? null,
        status: body.status,
      })
      .select("*, rehab_items(id, description)")
      .single();

    if (error) throw error;

    // Approved change orders update the line item's actual cost.
    if (body.status === "approved" && item) {
      await admin
        .from("rehab_items")
        .update({ actual_cost: (Number(item.actual_cost) || 0) + (Number(body.cost_impact) || 0) })
        .eq("id", rehabItemId);
    }

    return NextResponse.json({ changeOrder: data as ChangeOrder }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
