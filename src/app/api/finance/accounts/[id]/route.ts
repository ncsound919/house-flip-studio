import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { ACCOUNT_TYPES } from "@/lib/finance/balanceSheet";

type Params = { params: Promise<{ id: string }> };

const VALID_TYPES = new Set<string>(ACCOUNT_TYPES);

export async function PUT(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    const { data: existing } = await admin
      .from("company_accounts")
      .select("org_id")
      .eq("id", id)
      .single();
    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if ("account_name" in body && typeof body.account_name === "string" && body.account_name.trim()) {
      updates.account_name = body.account_name.trim();
    }
    if ("account_type" in body) {
      if (!VALID_TYPES.has(body.account_type)) {
        return NextResponse.json({ error: "Invalid account type" }, { status: 400 });
      }
      updates.account_type = body.account_type;
    }
    if ("balance" in body) updates.balance = Number(body.balance) || 0;
    if ("as_of" in body) updates.as_of = body.as_of ?? null;
    if ("notes" in body) updates.notes = body.notes ?? null;

    const { data, error } = await admin
      .from("company_accounts")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ account: data });
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
      .from("company_accounts")
      .select("org_id")
      .eq("id", id)
      .single();
    if (!existing || existing.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const { error } = await admin.from("company_accounts").delete().eq("id", id);
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
