import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

export const ENTITY_DOC_TYPES = [
  "operating_agreement",
  "ein_letter",
  "business_license",
  "insurance_cert",
  "banking_agreement",
  "tax_return",
  "financial_statement",
  "other",
] as const;

export type EntityDocType = (typeof ENTITY_DOC_TYPES)[number];
export type EntityDocStatus = "missing" | "requested" | "received" | "filed";

export interface EntityDocumentRow {
  id: string;
  org_id: string;
  doc_type: EntityDocType;
  status: EntityDocStatus;
  notes: string | null;
  file_url: string | null;
  received_at: string | null;
  created_at: string;
}

const VALID_TYPES = new Set<string>(ENTITY_DOC_TYPES);
const VALID_STATUS = new Set<EntityDocStatus>(["missing", "requested", "received", "filed"]);

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("entity_documents")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ documents: data });
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

    const doc_type: EntityDocType = VALID_TYPES.has(body.doc_type) ? body.doc_type : "other";
    const status: EntityDocStatus = VALID_STATUS.has(body.status) ? body.status : "missing";

    const received_at =
      status === "received" || status === "filed"
        ? body.received_at ?? new Date().toISOString().slice(0, 10)
        : null;

    const { data, error } = await admin
      .from("entity_documents")
      .insert({
        org_id: orgId,
        doc_type,
        status,
        notes: body.notes ?? null,
        file_url: body.file_url ?? null,
        received_at,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ document: data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
