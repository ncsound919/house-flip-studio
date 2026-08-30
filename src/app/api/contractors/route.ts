import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

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

export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();
    const url = new URL(request.url);

    let query = admin
      .from("contractors")
      .select("*")
      .eq("org_id", orgId)
      .order("name");

    const trade = url.searchParams.get("trade");
    if (trade) query = query.eq("trade", trade);

    const status = url.searchParams.get("status");
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ contractors: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();
    const body = await request.json();

    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const trade = typeof body.trade === "string" ? body.trade.trim() : "";
    if (!trade) {
      return NextResponse.json({ error: "Trade is required" }, { status: 400 });
    }
    if (!VALID_TRADES.has(trade)) {
      return NextResponse.json({ error: "Invalid trade" }, { status: 400 });
    }

    const status = body.status ?? "active";
    if (!VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const { data, error } = await admin
      .from("contractors")
      .insert({
        org_id: orgId,
        name,
        trade,
        phone: body.phone ?? null,
        email: body.email ?? null,
        license_number: body.license_number ?? null,
        license_board: body.license_board ?? "NC State Licensing Board for General Contractors",
        license_tier: body.license_tier ?? null,
        insurance_policy: body.insurance_policy ?? null,
        insurance_expiry: body.insurance_expiry ?? null,
        insurance_limit: body.insurance_limit ?? null,
        workers_comp_verified: body.workers_comp_verified ?? false,
        w9_on_file: body.w9_on_file ?? false,
        notes: body.notes ?? null,
        status,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ contractor: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
