import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

type Params = { params: Promise<{ id: string }> };

const VALID_TRADES = new Set([
  "General Contracting",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Roofing",
  "Structural",
  "Interior",
  "Exterior",
  "Specialty Trade",
]);

const VALID_STATUSES = new Set(["active", "available", "completed"]);

const UPDATABLE_FIELDS = [
  "name",
  "trade",
  "phone",
  "email",
  "license_number",
  "license_board",
  "license_tier",
  "insurance_policy",
  "insurance_expiry",
  "insurance_limit",
  "workers_comp_verified",
  "w9_on_file",
  "notes",
  "status",
] as const;

async function assertContractorInOrg(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  id: string
) {
  const { data, error } = await admin
    .from("contractors")
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

    const { data, error } = await admin
      .from("contractors")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data || data.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ contractor: data });
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

    await assertContractorInOrg(admin, orgId, id);

    const updates: Record<string, unknown> = {};
    for (const key of UPDATABLE_FIELDS) {
      if (key in body) updates[key] = body[key] ?? null;
    }

    if (updates.trade !== undefined && updates.trade !== null) {
      if (typeof updates.trade !== "string" || !VALID_TRADES.has(updates.trade)) {
        return NextResponse.json({ error: "Invalid trade" }, { status: 400 });
      }
    }
    if (updates.status !== undefined && updates.status !== null) {
      if (typeof updates.status !== "string" || !VALID_STATUSES.has(updates.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
    }

    const { data, error } = await admin
      .from("contractors")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ contractor: data });
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

    await assertContractorInOrg(admin, orgId, id);

    const { error } = await admin.from("contractors").delete().eq("id", id);
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
