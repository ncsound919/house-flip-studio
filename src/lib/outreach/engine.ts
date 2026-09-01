// Outreach engine — server-side acquisition execution.
//
// Loads the funnel + due-worklist, composes and sends outreach (Resend-backed
// with an honest draft fallback), and records owner responses. All rows are
// org-scoped and deterministic; the only side effect is a real send when a
// channel + key exist, which is recorded as 'sent'. Anything else is 'draft'
// and the operator sends it manually — never a fabricated claim of contact.

import { createAdminClient } from "@/lib/apiHelpers";
import { sendEmail } from "@/lib/agent/email";
import { nextOutreachAction, type CadenceConfig } from "@/lib/outreach/cadence";
import { buildOfferEmail, buildFollowUpEmail } from "@/lib/outreach/templates";

export type OutreachKind = "initial_offer" | "follow_up" | "counter" | "inquiry" | "note";
export type OutreachChannel = "email" | "mail" | "phone" | "in_person";
export type OutreachResponse = "none" | "no_interest" | "counter" | "accepted" | "undeliverable";

export interface OutreachRow {
  id: string;
  org_id: string;
  deal_id: string;
  kind: OutreachKind;
  channel: OutreachChannel;
  direction: "outbound" | "inbound";
  subject: string | null;
  body: string | null;
  offer_amount: number | null;
  valid_until: string | null;
  status: string; // draft | sent | failed
  response: OutreachResponse;
  response_note: string | null;
  provider_id: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
}

export interface OutreachDeal {
  id: string;
  org_id: string;
  address: string;
  city: string | null;
  stage: string;
  owner?: string | null;
  assessed_value?: number | null;
}

const OUTREACH_ACTIVE_STAGES = new Set(["Lead", "Inspecting", "Underwriting", "Offer Made"]);

export async function loadOutreachRows(orgId: string): Promise<OutreachRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("outreach")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  return (data ?? []) as OutreachRow[];
}

export interface DueOutreachItem {
  deal: OutreachDeal;
  decision: { next: "initial_offer" | "follow_up" | "mark_cold"; reason: string };
  lastContact: { kind: string; sent_at: string } | null;
  draft: { subject: string; body: string } | null;
}

export async function loadDueOutreach(
  orgId: string,
  cfg: CadenceConfig,
  signature: string
): Promise<DueOutreachItem[]> {
  const admin = createAdminClient();
  const { data: deals } = await admin
    .from("deals")
    .select("id, org_id, address, city, stage")
    .eq("org_id", orgId)
    .in("stage", [...OUTREACH_ACTIVE_STAGES]);

  const dealList = (deals ?? []) as OutreachDeal[];
  if (dealList.length === 0) return [];

  const rows = await loadOutreachRows(orgId);
  const rowsByDeal = new Map<string, OutreachRow[]>();
  for (const r of rows) {
    const list = rowsByDeal.get(r.deal_id) ?? [];
    list.push(r);
    rowsByDeal.set(r.deal_id, list);
  }

  const due: DueOutreachItem[] = [];
  for (const deal of dealList) {
    const dealRows = rowsByDeal.get(deal.id) ?? [];
    const { next, reason } = nextOutreachAction(dealRows, new Date().toISOString(), cfg);
    if (!next || next === "mark_cold") continue;

    const sentOutbound = dealRows
      .filter((r) => r.direction === "outbound" && r.status === "sent")
      .sort((a, b) => (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));
    const lastContact = sentOutbound.length
      ? { kind: sentOutbound[sentOutbound.length - 1].kind, sent_at: sentOutbound[sentOutbound.length - 1].sent_at ?? "" }
      : null;

    const draft =
      next === "follow_up"
        ? buildFollowUpEmail(
            {
              owner: deal.owner ?? null,
              address: deal.address,
              assessedValue: deal.assessed_value ?? null,
              signature,
            },
            sentOutbound.filter((r) => r.kind === "follow_up").length + 1
          )
        : buildOfferEmail({
            owner: deal.owner ?? null,
            address: deal.address,
            assessedValue: deal.assessed_value ?? null,
            signature,
          });

    due.push({ deal, decision: { next, reason }, lastContact, draft });
  }

  return due;
}

export interface SendOutreachInput {
  orgId: string;
  dealId: string;
  kind: OutreachKind;
  channel: OutreachChannel;
  direction?: "outbound" | "inbound";
  subject?: string;
  body?: string;
  offerAmount?: number | null;
  validUntil?: string | null;
  emailTo?: string | null;
}

export async function sendOutreach(input: SendOutreachInput): Promise<OutreachRow> {
  const admin = createAdminClient();
  const { data: deal } = await admin.from("deals").select("org_id").eq("id", input.dealId).single();
  if (!deal || deal.org_id !== input.orgId) {
    throw new Error("Not found");
  }

  const direction = input.direction ?? "outbound";
  const wantsEmailSend =
    direction === "outbound" &&
    input.channel === "email" &&
    !!input.emailTo &&
    (input.kind === "initial_offer" || input.kind === "follow_up" || input.kind === "counter");

  let status = "draft";
  let providerId: string | null = null;
  if (wantsEmailSend) {
    const result = await sendEmail({
      to: input.emailTo as string,
      subject: input.subject ?? "(no subject)",
      text: input.body ?? "",
    });
    if (result.sent) {
      status = "sent";
      providerId = result.id ?? null;
    }
  }

  const { data, error } = await admin
    .from("outreach")
    .insert({
      org_id: input.orgId,
      deal_id: input.dealId,
      kind: input.kind,
      channel: input.channel,
      direction,
      subject: input.subject ?? null,
      body: input.body ?? null,
      offer_amount: input.offerAmount ?? null,
      valid_until: input.validUntil ?? null,
      status,
      provider_id: providerId,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as OutreachRow;
}

export async function recordResponse(
  orgId: string,
  id: string,
  response: OutreachResponse,
  note?: string | null
): Promise<OutreachRow> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("outreach").select("org_id").eq("id", id).single();
  if (!existing || existing.org_id !== orgId) {
    throw new Error("Not found");
  }
  const { data, error } = await admin
    .from("outreach")
    .update({
      response,
      response_note: note ?? null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as OutreachRow;
}
