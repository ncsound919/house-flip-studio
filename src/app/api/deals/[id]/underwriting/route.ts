import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

type Params = { params: Promise<{ id: string }> };

const UNDERWRITING_FIELDS = [
  "arv",
  "rehab_estimate",
  "purchase_price",
  "holding_months",
  "down_payment_pct",
  "interest_rate",
  "loan_points",
  "max_offer",
  "final_purchase_price",
  "passes_70_rule",
  "acquisition_costs",
  "holding_costs",
  "selling_costs",
  "financing_costs",
  "total_project_cost",
  "projected_profit",
  "roi",
  "cash_on_cash",
  "down_payment_amount",
  "loan_amount",
] as const;

export async function GET(_request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();

    const { data: deal } = await admin.from("deals").select("org_id").eq("id", id).single();
    if (!deal || deal.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { data } = await admin.from("underwriting").select("*").eq("deal_id", id).single();
    return NextResponse.json({ underwriting: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    const { data: deal } = await admin.from("deals").select("org_id").eq("id", id).single();
    if (!deal || deal.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    for (const key of UNDERWRITING_FIELDS) {
      if (key === "passes_70_rule") {
        if (key in body) updates[key] = Boolean(body[key]);
      } else if (key in body) {
        updates[key] = body[key] != null && body[key] !== "" ? Number(body[key]) : null;
      }
    }
    updates.updated_at = new Date().toISOString();

    // Upsert by deal_id.
    const { data, error } = await admin
      .from("underwriting")
      .upsert({ deal_id: id, ...updates }, { onConflict: "deal_id" })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ underwriting: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
