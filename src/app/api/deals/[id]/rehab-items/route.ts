import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { REHAB_TRADES } from "@/lib/types";

export interface RehabItem {
  id: string;
  deal_id: string;
  org_id: string;
  trade: string;
  description: string;
  contractor_id: string | null;
  estimated_cost: number;
  actual_cost: number;
  status: "estimated" | "contracted" | "in_progress" | "completed";
  notes: string | null;
  created_at: string;
  contractors?: { name: string } | null;
}

type Params = { params: Promise<{ id: string }> };

const VALID_STATUS = new Set(["estimated", "contracted", "in_progress", "completed"]);

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

export async function GET(_request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();

    await assertDealInOrg(admin, orgId, id);

    const { data, error } = await admin
      .from("rehab_items")
      .select("*, contractors(name)")
      .eq("deal_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ items: data as RehabItem[] });
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

    const trade = REHAB_TRADES.includes(body.trade) ? body.trade : "General";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (!description) {
      return NextResponse.json({ error: "Description is required" }, { status: 400 });
    }
    if (body.status && !VALID_STATUS.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("rehab_items")
      .insert({
        deal_id: id,
        org_id: orgId,
        trade,
        description,
        contractor_id: body.contractor_id ?? null,
        estimated_cost: Number(body.estimated_cost) || 0,
        actual_cost: Number(body.actual_cost) || 0,
        status: body.status ?? "estimated",
        notes: body.notes ?? null,
      })
      .select("*, contractors(name)")
      .single();

    if (error) throw error;
    return NextResponse.json({ item: data as RehabItem }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
