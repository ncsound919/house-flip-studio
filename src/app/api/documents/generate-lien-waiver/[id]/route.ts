import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { buildLienWaiverPdf } from "@/lib/lienWaiver";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const { orgId } = await requireOrgId();
    const { id } = await params;
    const admin = createAdminClient();

    // Fetch the document + deal + contractor info.
    const { data: doc } = await admin
      .from("documents")
      .select("*, deals(id, address, org_id), rehab_items(id, description, contractor_id)")
      .eq("id", id)
      .single();

    if (!doc || doc.deals?.org_id !== orgId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const deal = doc.deals as { id: string; address: string; org_id: string };
    const rehabItem = doc.rehab_items as {
      id: string;
      description: string;
      contractor_id: string | null;
    } | null;

    let contractorName = "Contractor";
    if (rehabItem?.contractor_id) {
      const { data: contractor } = await admin
        .from("contractors")
        .select("name")
        .eq("id", rehabItem.contractor_id)
        .single();
      if (contractor) contractorName = contractor.name;
    }

    // Milestone title: use the rehab item description.
    const milestoneTitle = rehabItem?.description ?? "Progress payment";
    // Draw amount: use the rehab item's actual cost as the draw amount (best estimate).
    let drawAmount = 0;
    if (rehabItem) {
      const { data: item } = await admin
        .from("rehab_items")
        .select("actual_cost, estimated_cost")
        .eq("id", rehabItem.id)
        .single();
      if (item) drawAmount = Number(item.actual_cost) || Number(item.estimated_cost) || 0;
    }

    const pdf = buildLienWaiverPdf({
      propertyAddress: deal.address,
      contractorName,
      ownerName: "Owner (payor)",
      drawAmount,
      milestoneTitle,
      date: new Date().toISOString().slice(0, 10),
    });

    const buffer = await renderToBuffer(pdf);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="lien-waiver-${id}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
