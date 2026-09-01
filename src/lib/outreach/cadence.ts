// Acquisition cadence — the deterministic "what to do next" engine.
//
// Given a lead's full outreach log, decide the next acquisition action:
//   initial_offer — never contacted
//   follow_up     — an unanswered offer/follow-up has aged past its interval
//   mark_cold     — the unanswered follow-up chain is exhausted
//   null          — nothing due (inbound conversation live, or inside a window)
//
// HONESTY: this is a deterministic state machine over real log rows. It never
// fabricates a contact; "sent" means a row with status 'sent'. It never
// auto-proposes money without the operator — an offer is only ever generated,
// and sending stays behind the existing money-gate flow.

export type CadenceNext = "initial_offer" | "follow_up" | "mark_cold" | null;

export interface CadenceRecord {
  kind: string; // outreach_kind
  direction: string; // outbound | inbound
  status: string; // draft | sent | failed
  response: string; // outreach_response
  sent_at: string | null;
}

export interface CadenceConfig {
  initialFollowUpDays: number; // after the first offer is sent, follow up
  followUpDays: number; // between subsequent unanswered follow-ups
  maxFollowUps: number; // unanswered follow-ups before mark_cold
}

export const DEFAULT_CADENCE: CadenceConfig = {
  initialFollowUpDays: 7,
  followUpDays: 14,
  maxFollowUps: 3,
};

export interface CadenceDecision {
  next: CadenceNext;
  reason: string;
}

const daysBetween = (from: string, now: string) =>
  Math.max(0, Math.floor((new Date(now).getTime() - new Date(from).getTime()) / 86_400_000));

export function nextOutreachAction(
  records: CadenceRecord[],
  now: string,
  cfg: CadenceConfig = DEFAULT_CADENCE
): CadenceDecision {
  // A live inbound conversation (any response from the owner) hands control to
  // the operator — no automation should talk over a person mid-negotiation.
  const live = records.find(
    (r) => r.direction === "inbound" && r.response !== "none"
  );
  if (live) return { next: null, reason: "awaiting_operator" };

  const outbound = records
    .filter((r) => r.direction === "outbound" && r.status === "sent")
    .sort((a, b) => (a.sent_at ?? "").localeCompare(b.sent_at ?? ""));

  if (outbound.length === 0) {
    return { next: "initial_offer", reason: "never_contacted" };
  }

  const last = outbound[outbound.length - 1];
  if (!last.sent_at) return { next: null, reason: "unsent_draft" };

  const days = daysBetween(last.sent_at, now);

  if (last.kind === "initial_offer") {
    if (days >= cfg.initialFollowUpDays) {
      return { next: "follow_up", reason: "initial_offer_unanswered" };
    }
    return { next: null, reason: "within_first_window" };
  }

  const followUps = outbound.filter((r) => r.kind === "follow_up").length;
  if (followUps >= cfg.maxFollowUps) {
    return { next: "mark_cold", reason: "max_followups" };
  }
  if (days >= cfg.followUpDays) {
    return { next: "follow_up", reason: "followup_chain" };
  }
  return { next: null, reason: "within_followup_window" };
}
