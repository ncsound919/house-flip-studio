import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { DEBT_KINDS } from "@/lib/finance/debtSchedule";

const VALID_KINDS = new Set<string>(DEBT_KINDS);

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("debts")
      .select("*, deals(id, address)")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ debts: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();
    const body = await request.json();

    const lender = typeof body.lender === "string" ? body.lender.trim() : "";
    if (!lender) {
      return NextResponse.json({ error: "Lender is required" }, { status: 400 });
    }
    const kind = VALID_KINDS.has(body.kind) ? body.kind : "other";

    const { data, error } = await admin
      .from("debts")
      .insert({
        org_id: orgId,
        lender,
        kind,
        balance: Number(body.balance) || 0,
        interest_rate: body.interest_rate != null ? Number(body.interest_rate) : null,
        monthly_payment: body.monthly_payment != null ? Number(body.monthly_payment) : null,
        maturity_date: body.maturity_date ?? null,
        collateral_deal_id: body.collateral_deal_id ?? null,
        notes: body.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ debt: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
