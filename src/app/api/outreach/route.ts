import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { getOrgSettings } from "@/lib/orgSettings";
import { computeAcquisitionFunnel } from "@/lib/outreach/funnel";
import { loadOutreachRows, loadDueOutreach, sendOutreach } from "@/lib/outreach/engine";

const VALID_KINDS = new Set(["initial_offer", "follow_up", "counter", "inquiry", "note"]);
const VALID_CHANNELS = new Set(["email", "mail", "phone", "in_person"]);

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();
    const settings = await getOrgSettings(orgId);

    const { data: deals } = await admin.from("deals").select("*").eq("org_id", orgId);
    const rows = await loadOutreachRows(orgId);

    const funnel = computeAcquisitionFunnel({
      deals: (deals ?? []).map((d) => ({ id: d.id, stage: d.stage })),
      outreach: rows.map((r) => ({
        deal_id: r.deal_id,
        direction: r.direction,
        status: r.status,
        kind: r.kind,
        response: r.response,
      })),
    });

    const due = settings.outreach.enabled
      ? await loadDueOutreach(
          orgId,
          {
            initialFollowUpDays: settings.outreach.initialFollowUpDays,
            followUpDays: settings.outreach.followUpDays,
            maxFollowUps: settings.outreach.maxFollowUps,
          },
          settings.outreach.signature
        )
      : [];

    return NextResponse.json({ funnel, due, deals, outreach: rows });
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
    const body = await request.json();

    if (typeof body.deal_id !== "string" || !body.deal_id) {
      return NextResponse.json({ error: "deal_id is required" }, { status: 400 });
    }
    const kind = VALID_KINDS.has(body.kind) ? body.kind : "note";
    const channel = VALID_CHANNELS.has(body.channel) ? body.channel : "email";

    const row = await sendOutreach({
      orgId,
      dealId: body.deal_id,
      kind,
      channel,
      direction: body.direction === "inbound" ? "inbound" : "outbound",
      subject: body.subject,
      body: body.body,
      offerAmount: body.offer_amount != null ? Number(body.offer_amount) : null,
      validUntil: body.valid_until ?? null,
      emailTo: body.email_to ?? null,
    });

    return NextResponse.json({ outreach: row }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Not found" ? 404 : message === "Unauthorized" ? 401 : 500 }
    );
  }
}
