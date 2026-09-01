import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { loadCapitalForOrg } from "@/lib/finance/loadCapital";

const VALID_SOURCE = new Set(["operator_equity", "partner_capital"]);
const VALID_STATUS = new Set(["active", "repaid", "written_off"]);

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const data = await loadCapitalForOrg(orgId);
    return NextResponse.json(data);
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

    if (typeof body.deal_id !== "string" || !body.deal_id) {
      return NextResponse.json({ error: "deal_id is required" }, { status: 400 });
    }
    if (!VALID_SOURCE.has(body.source_type)) {
      return NextResponse.json({ error: "Invalid source_type" }, { status: 400 });
    }
    const source_name = typeof body.source_name === "string" && body.source_name.trim() ? body.source_name.trim() : "Self";

    const { data: deal } = await admin.from("deals").select("org_id").eq("id", body.deal_id).single();
    if (!deal || deal.org_id !== orgId) {
      return NextResponse.json({ error: "Deal not found" }, { status: 404 });
    }

    const { data, error } = await admin
      .from("capital_contributions")
      .insert({
        org_id: orgId,
        deal_id: body.deal_id,
        source_type: body.source_type,
        source_name,
        amount: Number(body.amount) || 0,
        annual_rate: Number(body.annual_rate) || 0,
        priority: Number(body.priority) || 0,
        status: VALID_STATUS.has(body.status) ? body.status : "active",
        funded_at: body.funded_at ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ contribution: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
