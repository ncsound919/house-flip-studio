import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { DEAL_STAGES, type Deal } from "@/lib/types";

const VALID_STAGES = new Set<string>(DEAL_STAGES);

type Params = { params: Promise<{ id: string }> };

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

export async function GET(_request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("deals")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data || data.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ deal: data as Deal });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();
    const body = await request.json();

    await assertDealInOrg(admin, orgId, id);

    const updates: Record<string, unknown> = {};
    for (const key of [
      "address",
      "city",
      "state",
      "zip",
      "photo_url",
      "asking_price",
      "sqft",
      "beds",
      "baths",
      "year_built",
      "lot_size",
    ]) {
      if (key in body) updates[key] = body[key] ?? null;
    }

    if ("stage" in body) {
      if (!VALID_STAGES.has(body.stage)) {
        return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
      }
      updates.stage = body.stage;
      if (body.stage !== undefined && body.stage !== null) {
        updates.stage_changed_at = new Date().toISOString();
      }
    }

    const { data, error } = await admin
      .from("deals")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ deal: data as Deal });
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

    await assertDealInOrg(admin, orgId, id);

    const { error } = await admin.from("deals").delete().eq("id", id);
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
