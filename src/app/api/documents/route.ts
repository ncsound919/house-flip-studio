import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

export type DocType =
  | "permit"
  | "contractor_quote"
  | "signed_contract"
  | "draw_request"
  | "conditional_lien_waiver"
  | "unconditional_lien_waiver"
  | "w9"
  | "insurance_cert";

export type DocStatus = "missing" | "requested" | "received" | "filed";

export interface DocumentRow {
  id: string;
  deal_id: string;
  rehab_item_id: string | null;
  org_id: string;
  doc_type: DocType;
  status: DocStatus;
  requested_at: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  deals?: { id: string; address: string; stage: string } | null;
  rehab_items?: { id: string; description: string; trade: string | null } | null;
}

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const dealId = searchParams.get("deal_id");
    const status = searchParams.get("status");

    // Documents joined with their deal + rehab item.
    let query = admin
      .from("documents")
      .select("*, deals(id, address, stage), rehab_items(id, description, trade)")
      .eq("org_id", orgId)
      .not("deal_id", "is", null);

    if (dealId) query = query.eq("deal_id", dealId);
    if (status) query = query.eq("status", status);

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ documents: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
