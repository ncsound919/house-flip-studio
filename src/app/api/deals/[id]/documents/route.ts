import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import type { DocStatus, DocType, DocumentRow } from "@/app/api/documents/route";

export type { DocStatus, DocType, DocumentRow };

type Params = { params: Promise<{ id: string }> };

const VALID_STATUS = new Set(["missing", "requested", "received", "filed"]);

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

export async function GET(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();

    await assertDealInOrg(admin, orgId, id);

    const { data, error } = await admin
      .from("documents")
      .select("*, rehab_items(id, description, trade)")
      .eq("deal_id", id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return NextResponse.json({ documents: data as DocumentRow[] });
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

    if (!VALID_STATUS.has(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("documents")
      .insert({
        deal_id: id,
        org_id: orgId,
        rehab_item_id: body.rehab_item_id ?? null,
        doc_type: body.doc_type,
        status: body.status ?? "missing",
        requested_at: body.requested_at ?? null,
        received_at: body.received_at ?? null,
        notes: body.notes ?? null,
      })
      .select("*, rehab_items(id, description, trade)")
      .single();

    if (error) throw error;
    return NextResponse.json({ document: data as DocumentRow }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
