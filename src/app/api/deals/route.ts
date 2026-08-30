import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { DEAL_STAGES, type Deal } from "@/lib/types";

const VALID_STAGES = new Set<string>(DEAL_STAGES);

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("deals")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ deals: data as Deal[] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { orgId, userId } = await requireOrgId();
    const admin = createAdminClient();
    const body = await request.json();

    const address = typeof body.address === "string" ? body.address.trim() : "";
    if (!address) {
      return NextResponse.json({ error: "Address is required" }, { status: 400 });
    }

    const stage = VALID_STAGES.has(body.stage) ? body.stage : "Lead";

    const { data, error } = await admin
      .from("deals")
      .insert({
        org_id: orgId,
        address,
        city: body.city ?? null,
        state: body.state ?? "NC",
        zip: body.zip ?? null,
        photo_url: body.photo_url ?? null,
        stage,
        source: body.source ?? "manual",
        asking_price: body.asking_price ?? null,
        sqft: body.sqft ?? null,
        beds: body.beds ?? null,
        baths: body.baths ?? null,
        year_built: body.year_built ?? null,
        lot_size: body.lot_size ?? null,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ deal: data as Deal }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
