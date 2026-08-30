import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();

    const [deals, contractors, rehabItems, changeOrders, documents, comments, propertyData, comps, underwriting, analyses] =
      await Promise.all([
        admin.from("deals").select("*").eq("org_id", orgId),
        admin.from("contractors").select("*").eq("org_id", orgId),
        admin.from("rehab_items").select("*").eq("org_id", orgId),
        admin.from("change_orders").select("*"),
        admin.from("documents").select("*").eq("org_id", orgId),
        admin.from("deal_comments").select("*"),
        admin.from("property_data").select("*"),
        admin.from("comps").select("*"),
        admin.from("underwriting").select("*"),
        admin.from("ai_analyses").select("*"),
      ]);

    // Filter change orders to those tied to this org's rehab items.
    const itemIds = new Set((rehabItems.data ?? []).map((i: { id: string }) => i.id));
    const orgChangeOrders = (changeOrders.data ?? []).filter((c: { rehab_item_id: string }) =>
      itemIds.has(c.rehab_item_id)
    );

    // Filter comments to those on this org's deals.
    const dealIds = new Set((deals.data ?? []).map((d: { id: string }) => d.id));
    const orgComments = (comments.data ?? []).filter((c: { deal_id: string }) =>
      dealIds.has(c.deal_id)
    );

    const payload = {
      exported_at: new Date().toISOString(),
      org_id: orgId,
      deals: deals.data ?? [],
      contractors: contractors.data ?? [],
      rehab_items: rehabItems.data ?? [],
      change_orders: orgChangeOrders,
      documents: documents.data ?? [],
      deal_comments: orgComments,
      property_data: propertyData.data ?? [],
      comps: comps.data ?? [],
      underwriting: underwriting.data ?? [],
      ai_analyses: analyses.data ?? [],
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="house-flip-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
