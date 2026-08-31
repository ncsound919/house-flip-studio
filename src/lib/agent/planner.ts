import { DEAL_STAGES, type DealStage } from "@/lib/types";
import { estimateArv, type ArvEstimate } from "@/lib/arvEstimate";
import type { AgentActionKind, ApprovalPayload } from "./types";

// Planner — the brain of the autonomous flip operator.
//
// PURE: takes a snapshot of real DB state, returns a list of agent actions to
// execute. No I/O. No side effects. The runner takes these and applies them.
//
// HONESTY: every action is explicit. Money actions are flagged
// requires_approval: true so the runner records them as pending_approval
// instead of executing. The runner never inspects a "kind" string to decide
// what to do — it only reads the flags the planner put on the action.
//
// STAGE MACHINE (money gates marked [GATE]):
//   Lead → Inspecting → Underwriting → Offer Made [GATE] → Under Contract [GATE]
//   → Rehab [GATE] → Listed → Closed [GATE]
//
// "Money gate" means: executing the action would commit real money, legal
// obligation, or outward RFQs/offer. The agent PREPARES the next move but
// never executes those without operator approval.

export interface PlannerDeal {
  id: string;
  org_id: string;
  address: string;
  city: string | null;
  stage: DealStage;
  asking_price: number | null;
  sqft: number | null;
  year_built: number | null;
  assessed_value: number | null;
  arv_estimate: number | null;
  arv_method: string | null;
}

export interface PlannerDocument {
  id: string;
  deal_id: string | null;
  rehab_item_id: string | null;
  doc_type: string;
  status: string;
  requested_at: string | null;
}

export interface PlannerRehabItem {
  id: string;
  deal_id: string;
  trade: string | null;
  status: string;
}

export interface PlannerContractor {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  trade: string | null;
  license_number: string | null;
  insurance_expiry: string | null;
  verified_at: string | null;
  license_checked_at: string | null;
}

export interface PlannerRfqDraft {
  id: string;
  deal_id: string;
  contractor_id: string;
}

export interface PlannerPendingGate {
  dealId: string;
  kind: string; // AgentActionKind as string
  to?: string; // advance_stage target, when known
}

export interface PlannerRecentChase {
  contractorId: string | null;
  at: string;
}

export interface PlannerPayment {
  id: string;
  rehab_item_id: string;
  status: string; // 'recorded' | 'approved' | 'paid'
  amount: number | null;
}

export interface PlannerState {
  orgId: string;
  deals: PlannerDeal[];
  documents: PlannerDocument[];
  rehabItems: PlannerRehabItem[];
  contractors: PlannerContractor[];
  rfqDrafts: PlannerRfqDraft[];
  // Money-gate actions already awaiting approval (dedup — never stack two
  // identical pending gates, and never re-emit what the operator hasn't acted on).
  pendingGates: PlannerPendingGate[];
  // Recent chase_document actions (cooldown so contractors aren't emailed daily).
  recentChases: PlannerRecentChase[];
  // Map of dealId → real comps entered for that deal (sale prices).
  comps: Record<string, Array<{ sale_price: number | null }>>;
  // Map of dealId → {hasUnderwriting, max_offer, projected_profit, passes_70_rule}
  underwritings: Record<
    string,
    {
      arv: number | null;
      passes_70_rule: boolean | null;
      projected_profit: number | null;
      max_offer: number | null;
    }
  >;
  // Set of dealIds that already have a research dossier on file.
  dossiers: Set<string>;
  // Map of dealId → rehab draw ledger rows for that deal.
  payments: Record<string, PlannerPayment[]>;
}

export interface PlannedAction {
  kind: AgentActionKind;
  dealId?: string;
  contractorId?: string;
  documentId?: string;
  title: string;
  detail: string;
  requires_approval: boolean;
  metadata: Record<string, unknown>;
  approval?: ApprovalPayload;
}

const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

// --- Per-stage rules ---------------------------------------------------------

function planForLead(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  // 0) Compile a research dossier once per deal (county tax, liens, permits,
  //    foreclosure notices, owner/occupancy). Non-money; runs in the job queue.
  emitFetchDossierIfMissing(deal, state, out);

  // 1) ARV estimate if we have assessed_value or sqft and no estimate yet.
  if (deal.arv_estimate == null && (deal.assessed_value != null || deal.sqft != null)) {
    const est: ArvEstimate = estimateArv({
      county: deal.city ? deriveCountyFromCity(deal.city) : "default",
      assessedValue: deal.assessed_value,
      sqft: deal.sqft,
      comps: state.comps[deal.id],
    });
    if (est.arv != null) {
      out.push({
        kind: "arv_estimate",
        dealId: deal.id,
        title: `Estimate ARV for ${deal.address}`,
        detail: `${est.source === "comps" ? "Real comps" : "Heuristic"} ${est.source} → ${money(est.arv)} (${est.confidence} confidence). ${est.disclaimer}`,
        requires_approval: false,
        metadata: {
          arv: est.arv,
          source: est.source,
          confidence: est.confidence,
          signals: est.signals,
          compCount: (state.comps[deal.id] ?? []).length,
        },
      });
    } else {
      out.push({
        kind: "info",
        dealId: deal.id,
        title: `${deal.address}: no ARV signal`,
        detail: "Add assessed value or sqft for a heuristic ARV estimate.",
        requires_approval: false,
        metadata: { reason: "no_arv_inputs" },
      });
    }
  }

  // 2) If we have ARV + asking price, queue an underwriting pass.
  if (deal.arv_estimate != null && deal.asking_price != null && !state.underwritings[deal.id]) {
    out.push({
      kind: "underwrite",
      dealId: deal.id,
      title: `Run underwriting for ${deal.address}`,
      detail: `Heuristic ARV ${money(deal.arv_estimate)} — run 70% rule against asking ${money(deal.asking_price)}.`,
      requires_approval: false,
      metadata: {
        arv: deal.arv_estimate,
        asking_price: deal.asking_price,
        note: "ARV is heuristic estimate; underwriting output is a feasibility signal, not a verified deal.",
      },
    });
  }

  // 3) If underwriting already passed and we're in Lead, advance to Inspecting.
  //    Inspecting is NOT a money gate — it just means "worth a look".
  const uw = state.underwritings[deal.id];
  if (uw && uw.passes_70_rule === true) {
    out.push({
      kind: "advance_stage",
      dealId: deal.id,
      title: `Move ${deal.address} → Inspecting`,
      detail: `Underwriting passes 70% rule. Max offer ${money(uw.max_offer)}. ARV is an estimate; physical inspection is required.`,
      requires_approval: false,
      metadata: { to: "Inspecting" },
      approval: { dealId: deal.id, toStage: "Inspecting" },
    });
  }

  // 4) If ARV is heuristic, pull real comps so underwriting can run on real sales.
  planForComps(deal, state, out);
}

function planForComps(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  // Real comps upgrade ARV from heuristic to comp-based. If the deal already has
  // an ARV but it wasn't comp-derived and fewer than 2 comps are on file, emit a
  // real fetch_comps action so the runner pulls deed-transfer comps.
  if (deal.arv_method === "comps") return;
  if (deal.arv_estimate == null) return; // nothing to upgrade yet
  const compCount = (state.comps[deal.id] ?? []).length;
  if (compCount < 2) {
    out.push({
      kind: "fetch_comps",
      dealId: deal.id,
      title: `Fetch real comps for ${deal.address}`,
      detail: `ARV is ${deal.arv_method ?? "heuristic"} (${money(deal.arv_estimate)}). Agent will pull deed-transfer comps to upgrade underwriting.`,
      requires_approval: false,
      metadata: { reason: "comps_missing", compCount },
    });
  } else {
    out.push({
      kind: "info",
      dealId: deal.id,
      title: `Comps on file for ${deal.address}`,
      detail: `${compCount} comps present — ARV can be upgraded if re-estimated.`,
      requires_approval: false,
      metadata: { reason: "comps_present", compCount },
    });
  }
}

function planForInspecting(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  // Research dossier + inspection scheduling are non-money: the guardrail
  // decides auto-schedule vs propose, the operator always authorizes the visit.
  emitFetchDossierIfMissing(deal, state, out);
  out.push({
    kind: "schedule_inspection",
    dealId: deal.id,
    title: `Schedule inspection for ${deal.address}`,
    detail: "Non-money. The agent proposes an inspection window; guardrails may auto-schedule, otherwise it stays an operator note.",
    requires_approval: false,
    metadata: { windowDays: 7, auto: false },
  });

  // Draft a rehab scope early so budget planning can start before Rehab.
  const hasScope = state.rehabItems.some((r) => r.deal_id === deal.id);
  if (!hasScope) {
    out.push({
      kind: "generate_scope",
      dealId: deal.id,
      title: `Draft rehab scope for ${deal.address}`,
      detail: "No rehab scope on file. Agent will draft estimated line items (reviewable).",
      requires_approval: false,
      metadata: { note: "Deterministic costs; LLM-polished descriptions when enabled" },
    });
  }
  planForComps(deal, state, out);
  // If underwriting exists and passes, advance to Underwriting. NOT a money gate.
  const uw = state.underwritings[deal.id];
  if (uw && uw.passes_70_rule === true) {
    out.push({
      kind: "advance_stage",
      dealId: deal.id,
      title: `Move ${deal.address} → Underwriting`,
      detail: `Underwriting passes. ARV ${money(uw.arv)}, max offer ${money(uw.max_offer)}.`,
      requires_approval: false,
      metadata: { to: "Underwriting" },
      approval: { dealId: deal.id, toStage: "Underwriting" },
    });
  } else {
    out.push({
      kind: "info",
      dealId: deal.id,
      title: `${deal.address}: awaiting inspection or underwriting data`,
      detail: "Complete the inspection, then mark underwriting ready. Agent will re-evaluate.",
      requires_approval: false,
      metadata: { reason: "awaiting_human" },
    });
  }
}

function planForUnderwriting(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  // Draft a rehab scope if not already present (used for offer/rehab planning).
  const hasScope = state.rehabItems.some((r) => r.deal_id === deal.id);
  if (!hasScope) {
    out.push({
      kind: "generate_scope",
      dealId: deal.id,
      title: `Draft rehab scope for ${deal.address}`,
      detail: "No rehab scope on file. Draft line items so underwriting can include real rehab estimates.",
      requires_approval: false,
      metadata: { note: "Deterministic costs; LLM-polished descriptions when enabled" },
    });
  }
  planForComps(deal, state, out);
  // Money gate: making an offer. The agent DRAFTS the advance but does NOT execute.
  // Never stack a second pending gate if one already awaits approval.
  const uw = state.underwritings[deal.id];
  if (uw && uw.passes_70_rule === true && !hasPendingGate(state, deal.id, "advance_stage", "Offer Made")) {
    out.push({
      kind: "advance_stage",
      dealId: deal.id,
      title: `Make an offer: ${deal.address} → Offer Made`,
      detail: `ARV ${money(uw.arv)}, max offer ${money(uw.max_offer)}, projected profit ${money(uw.projected_profit)}. ARV is a heuristic — confirm comps before approving.`,
      requires_approval: true,
      metadata: { to: "Offer Made", uw },
      approval: { dealId: deal.id, toStage: "Offer Made" },
    });
  } else {
    out.push({
      kind: "info",
      dealId: deal.id,
      title: `${deal.address}: underwriting did not pass 70% rule`,
      detail: uw
        ? `Max offer ${money(uw.max_offer)} exceeds 70% rule ceiling. Walk away or re-evaluate rehab scope.`
        : "No underwriting on file.",
      requires_approval: false,
      metadata: { reason: "underwriting_fail" },
    });
  }
}

function planForOfferMade(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  // Money gate: signing a contract / committing earnest money.
  if (hasPendingGate(state, deal.id, "advance_stage", "Under Contract")) return;
  out.push({
    kind: "advance_stage",
    dealId: deal.id,
    title: `Move ${deal.address} → Under Contract`,
    detail: "Requires operator review of the signed contract, contingencies, and earnest money.",
    requires_approval: true,
    metadata: { to: "Under Contract" },
    approval: { dealId: deal.id, toStage: "Under Contract" },
  });
}

function planForUnderContract(
  deal: PlannerDeal,
  state: PlannerState,
  out: PlannedAction[]
) {
  // Request the standard contract document.
  requestDocumentIfMissing(deal, "signed_contract", state, out);
  // Money gate: starting rehab = beginning to spend.
  if (hasPendingGate(state, deal.id, "advance_stage", "Rehab")) return;
  out.push({
    kind: "advance_stage",
    dealId: deal.id,
    title: `Start rehab: ${deal.address} → Rehab`,
    detail: "Begin spend. Ensure signed contract is on file, permits identified, and contractors lined up.",
    requires_approval: true,
    metadata: { to: "Rehab" },
    approval: { dealId: deal.id, toStage: "Rehab" },
  });
}

function planForRehab(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  // Ensure the standard document set is requested.
  for (const docType of ["permit", "insurance_cert", "w9", "conditional_lien_waiver"]) {
    requestDocumentIfMissing(deal, docType, state, out);
  }
  // Chase any doc that's been requested > 7 days and is still missing/received.
  chaseOverdueDocuments(deal, state, out);

  const items = state.rehabItems.filter((r) => r.deal_id === deal.id);
  const payments = state.payments[deal.id] ?? [];

  // Rehab draw ledger: record a payment for each contracted item that doesn't
  // have one yet (non-money — recording is bookkeeping, spending is gated).
  for (const item of items) {
    if (item.status !== "contracted") continue;
    const alreadyRecorded = payments.some((p) => p.rehab_item_id === item.id);
    if (!alreadyRecorded) {
      out.push({
        kind: "record_payment",
        dealId: deal.id,
        title: `Record payment draw for ${item.trade ?? "item"} on ${deal.address}`,
        detail: "Non-money ledger entry for the contracted item. Spending it stays approval-gated.",
        requires_approval: false,
        metadata: { rehab_item_id: item.id, deal_id: deal.id },
      });
    }
  }
  // Money gate: a recorded-but-unapproved draw awaits approval before funds move.
  for (const p of payments) {
    if (p.status !== "recorded") continue;
    if (hasPendingGate(state, deal.id, "approve_payment")) continue;
    out.push({
      kind: "approve_payment",
      dealId: deal.id,
      title: `Approve payment draw on ${deal.address}`,
      detail: "MONEY GATE — a recorded rehab draw awaits approval before funds move.",
      requires_approval: true,
      metadata: { payment_id: p.id, rehab_item_id: p.rehab_item_id, amount: p.amount, deal_id: deal.id },
    });
  }

  // If all rehab items completed, advance to Listed.
  if (
    items.length > 0 &&
    items.every((r) => r.status === "completed") &&
    !hasPendingGate(state, deal.id, "advance_stage", "Listed")
  ) {
    out.push({
      kind: "advance_stage",
      dealId: deal.id,
      title: `List for sale: ${deal.address} → Listed`,
      detail: `All ${items.length} rehab items marked completed.`,
      requires_approval: true, // listing is a major business action
      metadata: { to: "Listed", itemCount: items.length },
      approval: { dealId: deal.id, toStage: "Listed" },
    });
  }

  // Comps-based list price recommendation once rehab is complete. The listing
  // advance itself stays money-gated; this only informs the operator.
  if (items.length > 0 && items.every((r) => r.status === "completed")) {
    out.push({
      kind: "recommend_list_price",
      dealId: deal.id,
      title: `Recommend list price for ${deal.address}`,
      detail: "Deterministic: max(ARV, comps median × 1.02). Listing stays operator-gated.",
      requires_approval: false,
      metadata: { arv: deal.arv_estimate },
    });
  }

  // Draft RFQs for verified contractors on this deal with real scope to price.
  // Draft-only (requires_approval: false); the send stays money-gated.
  if (items.length > 0) {
    for (const c of state.contractors) {
      if (!c.verified_at || !c.trade) continue;
      const alreadyDrafted = state.rfqDrafts.some(
        (d) => d.deal_id === deal.id && d.contractor_id === c.id
      );
      if (alreadyDrafted) continue;
      const itemCount = items.length;
      out.push({
        kind: "draft_rfq",
        dealId: deal.id,
        contractorId: c.id,
        title: `Draft RFQ for ${c.name} (${c.trade}) on ${deal.address}`,
        detail: `${itemCount} rehab item${itemCount === 1 ? "" : "s"} ready to price. Draft saved for review; sending requires approval.`,
        requires_approval: false,
        metadata: { rehabItemIds: items.map((i) => i.id) },
      });
    }
  }

  emitPredictExit(deal, state, out);
}

function planForListed(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  // Money gate: closing the sale.
  if (hasPendingGate(state, deal.id, "advance_stage", "Closed")) return;
  emitPredictExit(deal, state, out);
  out.push({
    kind: "advance_stage",
    dealId: deal.id,
    title: `Close sale: ${deal.address} → Closed`,
    detail: "Closing the sale releases proceeds. Operator must confirm closing docs and buyer funds.",
    requires_approval: true,
    metadata: { to: "Closed" },
    approval: { dealId: deal.id, toStage: "Closed" },
  });
}

// --- Helpers -----------------------------------------------------------------

function hasPendingGate(
  state: PlannerState,
  dealId: string,
  kind: AgentActionKind,
  to?: string
): boolean {
  return state.pendingGates.some(
    (g) => g.dealId === dealId && g.kind === kind && (to == null || g.to == null || g.to === to)
  );
}

// One dossier per deal, queued once. The async job processor compiles it and
// upserts the dossiers row, which flips this off on the next cycle.
function emitFetchDossierIfMissing(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  if (state.dossiers.has(deal.id)) return;
  out.push({
    kind: "fetch_dossier",
    dealId: deal.id,
    title: `Compile research dossier for ${deal.address}`,
    detail: "Queued: county tax record, liens, permits, foreclosure notices, and owner/occupancy signals.",
    requires_approval: false,
    metadata: { address: deal.address },
  });
}

// Deterministic exit projection (timeline + proceeds vs carrying costs).
function emitPredictExit(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  out.push({
    kind: "predict_exit",
    dealId: deal.id,
    title: `Predict exit for ${deal.address}`,
    detail: "Timeline + proceeds vs carrying costs. Deterministic projection — not a guarantee.",
    requires_approval: false,
    metadata: { projected: true },
  });
}

// Contractor-level oversight, run once per cycle (not once per deal) so a
// contractor with N Rehab deals never gets N verify/chase actions in a run.
function planContractorOversight(state: PlannerState, out: PlannedAction[]) {
  for (const c of state.contractors) {
    // License verification: first sight, 24h cooldown after a failed check,
    // or 30d refresh for previously-verified ones. Never hammers nclbgc.
    if (c.license_number) {
      const verified = Boolean(c.verified_at);
      const checkedRecently = c.license_checked_at != null && daysAgo(c.license_checked_at) < 1;
      const needsFirstCheck = !verified && !checkedRecently;
      const needsRefresh = verified && stale(c.verified_at!, 30);
      if (needsFirstCheck || needsRefresh) {
        out.push({
          kind: "verify_contractor",
          contractorId: c.id,
          title: `Verify license for ${c.name}`,
          detail: verified
            ? `Last verified ${daysAgo(c.verified_at!)}d ago — refresh against nclbgc.`
            : checkedRecently
            ? `Previous check did not verify (checked ${daysAgo(c.license_checked_at!)}d ago).`
            : "No prior verification on file.",
          requires_approval: false,
          metadata: { license_number: c.license_number },
        });
      }
    }
    // Insurance expiring within 30 days → chase email. Cooldown: only re-chase
    // if we haven't already chased this contractor within the last 7 days.
    if (c.insurance_expiry) {
      const d = daysUntil(c.insurance_expiry);
      if (d != null && d <= 30 && d > 0 && !chasedRecently(state, c.id)) {
        out.push({
          kind: "chase_document",
          contractorId: c.id,
          title: `Ask ${c.name} for updated insurance cert`,
          detail: `Current policy expires in ${d} day${d === 1 ? "" : "s"}.`,
          requires_approval: false,
          metadata: { reason: "insurance_expiring", expiry: c.insurance_expiry },
        });
      }
    }
  }
}

function chasedRecently(state: PlannerState, contractorId: string, withinDays = 7): boolean {
  const cutoff = Date.now() - withinDays * 86_400_000;
  return state.recentChases.some(
    (c) => c.contractorId === contractorId && new Date(c.at).getTime() >= cutoff
  );
}

function requestDocumentIfMissing(
  deal: PlannerDeal,
  docType: string,
  state: PlannerState,
  out: PlannedAction[]
) {
  const exists = state.documents.some(
    (d) => d.deal_id === deal.id && d.doc_type === docType
  );
  if (exists) return;
  out.push({
    kind: "generate_document",
    dealId: deal.id,
    title: `Request ${docType.replace(/_/g, " ")} for ${deal.address}`,
    detail: `No ${docType} on file for this deal. Created as "requested" — operator to follow up.`,
    requires_approval: false,
    metadata: { docType, dealId: deal.id },
  });
}

function chaseOverdueDocuments(
  deal: PlannerDeal,
  state: PlannerState,
  out: PlannedAction[]
) {
  const now = Date.now();
  for (const d of state.documents) {
    if (d.deal_id !== deal.id) continue;
    if (d.status === "received" || d.status === "filed") continue;
    if (!d.requested_at) continue;
    const requested = new Date(d.requested_at + "T00:00:00").getTime();
    if (Number.isNaN(requested)) continue;
    const overdueDays = Math.floor((now - requested) / 86_400_000);
    if (overdueDays >= 7) {
      out.push({
        kind: "chase_document",
        dealId: deal.id,
        documentId: d.id,
        title: `Chase overdue ${d.doc_type.replace(/_/g, " ")} on ${deal.address}`,
        detail: `Requested ${overdueDays} day${overdueDays === 1 ? "" : "s"} ago, still ${d.status}.`,
        requires_approval: false,
        metadata: { docId: d.id, docType: d.doc_type, overdueDays },
      });
    }
  }
}

function deriveCountyFromCity(city: string): string {
  const c = city.toLowerCase();
  if (c.includes("charlotte")) return "Mecklenburg";
  if (c.includes("raleigh") || c.includes("cary") || c.includes("apex") || c.includes("morrisville"))
    return "Wake";
  if (c.includes("durham")) return "Durham";
  if (c.includes("greensboro") || c.includes("high point") || c.includes("winston"))
    return "Guilford";
  return "default";
}

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function daysUntil(iso: string): number | null {
  const t = new Date(iso + "T00:00:00").getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / 86_400_000);
}

function stale(iso: string, maxAgeDays: number): boolean {
  return daysAgo(iso) > maxAgeDays;
}

// --- Entry point -------------------------------------------------------------

export function planAgentActions(state: PlannerState): PlannedAction[] {
  const out: PlannedAction[] = [];
  for (const deal of state.deals) {
    if (deal.stage === "Closed") continue;
    switch (deal.stage) {
      case "Lead":
        planForLead(deal, state, out);
        break;
      case "Inspecting":
        planForInspecting(deal, state, out);
        break;
      case "Underwriting":
        planForUnderwriting(deal, state, out);
        break;
      case "Offer Made":
        planForOfferMade(deal, state, out);
        break;
      case "Under Contract":
        planForUnderContract(deal, state, out);
        break;
      case "Rehab":
        planForRehab(deal, state, out);
        break;
      case "Listed":
        planForListed(deal, state, out);
        break;
    }
  }
  // Contractor oversight is org-wide and run once per cycle.
  planContractorOversight(state, out);
  return out;
}

// Re-export DEAL_STAGES so the runner can validate advancement targets.
export { DEAL_STAGES };
