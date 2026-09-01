import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/finance/balanceSheet";

const VALID_TYPES = new Set<string>(ACCOUNT_TYPES);

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("company_accounts")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ accounts: data });
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

    const account_name = typeof body.account_name === "string" ? body.account_name.trim() : "";
    if (!account_name) {
      return NextResponse.json({ error: "Account name is required" }, { status: 400 });
    }
    const account_type: AccountType = VALID_TYPES.has(body.account_type)
      ? body.account_type
      : "cash";
    const balance = Number(body.balance) || 0;
    const as_of = typeof body.as_of === "string" && body.as_of ? body.as_of : new Date().toISOString().slice(0, 10);

    const { data, error } = await admin
      .from("company_accounts")
      .insert({
        org_id: orgId,
        account_name,
        account_type,
        balance,
        as_of,
        notes: body.notes ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ account: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
