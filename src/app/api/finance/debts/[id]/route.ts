import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { DEBT_KINDS } from "@/lib/finance/debtSchedule";

type Params = { params: Promise<{ id: string }> };

const VALID_KINDS = new Set<string>(DEBT_KINDS);

export async function PUT(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    const { data: existing } = await admin
      .from("debts")
      .select("org_id")
      .eq("id", id)
      .single();
    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if ("lender" in body && typeof body.lender === "string" && body.lender.trim()) {
      updates.lender = body.lender.trim();
    }
    if ("kind" in body) {
      if (!VALID_KINDS.has(body.kind)) {
        return NextResponse.json({ error: "Invalid debt kind" }, { status: 400 });
      }
      updates.kind = body.kind;
    }
    if ("balance" in body) updates.balance = Number(body.balance) || 0;
    if ("interest_rate" in body) updates.interest_rate = body.interest_rate != null ? Number(body.interest_rate) : null;
    if ("monthly_payment" in body) updates.monthly_payment = body.monthly_payment != null ? Number(body.monthly_payment) : null;
    if ("maturity_date" in body) updates.maturity_date = body.maturity_date ?? null;
    if ("collateral_deal_id" in body) updates.collateral_deal_id = body.collateral_deal_id ?? null;
    if ("notes" in body) updates.notes = body.notes ?? null;

    const { data, error } = await admin
      .from("debts")
      .update(updates)
      .eq("id", id)
      .select("*, deals(id, address)")
      .single();
    if (error) throw error;
    return NextResponse.json({ debt: data });
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
      .from("debts")
      .select("org_id")
      .eq("id", id)
      .single();
    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await admin.from("debts").delete().eq("id", id);
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
