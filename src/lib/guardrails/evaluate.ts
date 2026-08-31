import type { GuardrailLimits } from "./limits";

export type EvaluationDecision = "execute" | "auto_approve" | "escalate" | "block";

export interface Evaluation {
  decision: EvaluationDecision;
  rule?: string;
  evidence?: string;
  reason?: string;
}

export interface EvaluatedAction {
  kind: string;
  requiresApproval: boolean;
  // advance_stage targets (Offer Made → an offer; Rehab → starting spend).
  toStage?: string;
}

interface ActionContext {
  amount?: number;
  offersToday?: number;
  rfqsToday?: number;
  spendThisMonth?: number;
  chasesToday?: number;
  inspectionsToday?: number;
}

// HONESTY: money actions only auto-approve when their rule is explicitly enabled
// AND the amount/cap check passes. Every auto-approval carries rule + evidence.
export function evaluateAction(
  action: EvaluatedAction,
  limits: GuardrailLimits,
  ctx: ActionContext
): Evaluation {
  if (!action.requiresApproval) return { decision: "execute" };

  switch (action.kind) {
    case "send_offer":
    case "advance_stage": {
      // advance_stage → Offer Made is an offer; → Rehab is starting rehab spend.
      if (action.kind === "advance_stage" && action.toStage === "Rehab") {
        const l = limits.autoSpendRehab;
        if (!l.enabled || l.monthlyCap <= 0) return { decision: "escalate" };
        const amount = Number(ctx.amount) || 0;
        if ((ctx.spendThisMonth ?? 0) + amount > l.monthlyCap) {
          return { decision: "block", reason: `monthly spend would exceed cap $${l.monthlyCap.toLocaleString("en-US")}` };
        }
        return {
          decision: "auto_approve",
          rule: "autoSpendRehab",
          evidence: `spend $${amount.toLocaleString("en-US")} within $${l.monthlyCap.toLocaleString("en-US")}`,
        };
      }
      if (action.kind === "advance_stage" && action.toStage !== "Offer Made") {
        // Under Contract / Listed / Closed advances stay operator-gated.
        return { decision: "escalate" };
      }
      const l = limits.autoSendOffers;
      if (!l.enabled || l.maxOfferAmount <= 0) return { decision: "escalate" };
      const amount = Number(ctx.amount) || 0;
      if (amount > l.maxOfferAmount) {
        return {
          decision: "block",
          reason: `offer $${amount.toLocaleString("en-US")} exceeds maxOfferAmount $${l.maxOfferAmount.toLocaleString("en-US")}`,
        };
      }
      if ((ctx.offersToday ?? 0) >= l.dailyCap) {
        return { decision: "block", reason: `dailyCap ${l.dailyCap} reached` };
      }
      return {
        decision: "auto_approve",
        rule: "autoSendOffers",
        evidence: `offer $${amount.toLocaleString("en-US")} ≤ $${l.maxOfferAmount.toLocaleString("en-US")}, cap ${l.dailyCap}`,
      };
    }
    case "send_rfq": {
      const l = limits.autoSendRfq;
      if (!l.enabled || l.dailyCap <= 0) return { decision: "escalate" };
      if ((ctx.rfqsToday ?? 0) >= l.dailyCap) {
        return { decision: "block", reason: `dailyCap ${l.dailyCap} reached` };
      }
      return { decision: "auto_approve", rule: "autoSendRfq", evidence: `cap ${l.dailyCap}` };
    }
    case "start_rehab":
    case "approve_payment": {
      const l = limits.autoSpendRehab;
      if (!l.enabled || l.monthlyCap <= 0) return { decision: "escalate" };
      const amount = Number(ctx.amount) || 0;
      if ((ctx.spendThisMonth ?? 0) + amount > l.monthlyCap) {
        return { decision: "block", reason: `monthly spend would exceed cap $${l.monthlyCap.toLocaleString("en-US")}` };
      }
      return {
        decision: "auto_approve",
        rule: "autoSpendRehab",
        evidence: `spend $${amount.toLocaleString("en-US")} within $${l.monthlyCap.toLocaleString("en-US")}`,
      };
    }
    case "chase_document": {
      const l = limits.autoChase;
      if (!l.enabled || l.dailyCap <= 0) return { decision: "escalate" };
      if ((ctx.chasesToday ?? 0) >= l.dailyCap) {
        return { decision: "block", reason: `dailyCap ${l.dailyCap} reached` };
      }
      return { decision: "auto_approve", rule: "autoChase", evidence: `cap ${l.dailyCap}` };
    }
    case "schedule_inspection": {
      const l = limits.autoScheduleInspections;
      if (!l.enabled || l.maxPerDay <= 0) return { decision: "escalate" };
      if ((ctx.inspectionsToday ?? 0) >= l.maxPerDay) {
        return { decision: "block", reason: `maxPerDay ${l.maxPerDay} reached` };
      }
      return { decision: "auto_approve", rule: "autoScheduleInspections", evidence: `max ${l.maxPerDay}` };
    }
    default:
      return { decision: "escalate" };
  }
}