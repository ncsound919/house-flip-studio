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
}

export interface PlannerState {
  orgId: string;
  deals: PlannerDeal[];
  documents: PlannerDocument[];
  rehabItems: PlannerRehabItem[];
  contractors: PlannerContractor[];
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
  // 1) ARV estimate if we have assessed_value or sqft and no estimate yet.
  if (deal.arv_estimate == null && (deal.assessed_value != null || deal.sqft != null)) {
    const est: ArvEstimate = estimateArv({
      county: deal.city ? deriveCountyFromCity(deal.city) : "default",
      assessedValue: deal.assessed_value,
      sqft: deal.sqft,
    });
    if (est.arv != null) {
      out.push({
        kind: "arv_estimate",
        dealId: deal.id,
        title: `Estimate ARV for ${deal.address}`,
        detail: `Heuristic ${est.source} → ${money(est.arv)} (${est.confidence} confidence). ${est.disclaimer}`,
        requires_approval: false,
        metadata: {
          arv: est.arv,
          source: est.source,
          confidence: est.confidence,
          signals: est.signals,
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
}

function planForInspecting(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
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
  // Money gate: making an offer. The agent DRAFTS the advance but does NOT execute.
  const uw = state.underwritings[deal.id];
  if (uw && uw.passes_70_rule === true) {
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

function planForOfferMade(deal: PlannerDeal, out: PlannedAction[]) {
  // Money gate: signing a contract / committing earnest money.
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
  // Verify contractor licenses on first sight (or refresh every 30d).
  for (const c of state.contractors) {
    if (c.license_number && (!c.verified_at || stale(c.verified_at, 30))) {
      out.push({
        kind: "verify_contractor",
        contractorId: c.id,
        dealId: deal.id,
        title: `Verify license for ${c.name}`,
        detail: c.verified_at
          ? `Last verified ${daysAgo(c.verified_at)}d ago — refresh against nclbgc.`
          : "No prior verification on file.",
        requires_approval: false,
        metadata: { license_number: c.license_number },
      });
    }
    // Insurance expiring within 30 days → chase email to the contractor.
    if (c.insurance_expiry) {
      const d = daysUntil(c.insurance_expiry);
      if (d != null && d <= 30 && d > 0) {
        out.push({
          kind: "chase_document",
          dealId: deal.id,
          contractorId: c.id,
          title: `Ask ${c.name} for updated insurance cert`,
          detail: `Current policy expires in ${d} day${d === 1 ? "" : "s"}.`,
          requires_approval: false,
          metadata: { reason: "insurance_expiring", expiry: c.insurance_expiry },
        });
      }
    }
  }
  // If all rehab items completed, advance to Listed.
  const items = state.rehabItems.filter((r) => r.deal_id === deal.id);
  if (items.length > 0 && items.every((r) => r.status === "completed")) {
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
}

function planForListed(deal: PlannerDeal, out: PlannedAction[]) {
  // Money gate: closing the sale.
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
        planForOfferMade(deal, out);
        break;
      case "Under Contract":
        planForUnderContract(deal, state, out);
        break;
      case "Rehab":
        planForRehab(deal, state, out);
        break;
      case "Listed":
        planForListed(deal, out);
        break;
    }
  }
  return out;
}

// Re-export DEAL_STAGES so the runner can validate advancement targets.
export { DEAL_STAGES };
