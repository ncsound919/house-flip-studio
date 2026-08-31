import { describe, it, expect } from "vitest";
import { guardrailLimitsSchema, DEFAULT_GUARDRAILS } from "../lib/guardrails/limits";
import { evaluateAction } from "../lib/guardrails/evaluate";

describe("guardrailLimitsSchema", () => {
  it("defaults are all disabled (conservative pass-through)", () => {
    const g = guardrailLimitsSchema.parse({});
    expect(g.autoSendOffers.enabled).toBe(false);
    expect(g.autoSendRfq.enabled).toBe(false);
    expect(g.autoSpendRehab.enabled).toBe(false);
    expect(g.autoChase.enabled).toBe(false);
    expect(g.autoScheduleInspections.enabled).toBe(false);
  });

  it("accepts an explicit limit patch", () => {
    const g = guardrailLimitsSchema.parse({
      autoSendOffers: { enabled: true, maxOfferAmount: 50_000, dailyCap: 2 },
    });
    expect(g.autoSendOffers.maxOfferAmount).toBe(50_000);
  });

  it("exposes DEFAULT_GUARDRAILS equal to the parsed defaults", () => {
    expect(DEFAULT_GUARDRAILS.autoSendOffers.enabled).toBe(false);
  });
});

describe("evaluateAction — all limits disabled", () => {
  it("non-money actions always execute", () => {
    expect(
      evaluateAction({ kind: "arv_estimate", requiresApproval: false }, DEFAULT_GUARDRAILS, {})
    ).toEqual({ decision: "execute" });
  });

  it("money actions escalate when their rule is disabled", () => {
    const r = evaluateAction({ kind: "send_offer", requiresApproval: true }, DEFAULT_GUARDRAILS, { amount: 40_000 });
    expect(r.decision).toBe("escalate");
  });

  it("auto-approved when rule enabled and within limit", () => {
    const limits = { ...DEFAULT_GUARDRAILS, autoSendOffers: { enabled: true, maxOfferAmount: 50_000, dailyCap: 5 } };
    const r = evaluateAction({ kind: "send_offer", requiresApproval: true }, limits, { amount: 40_000, offersToday: 1 });
    expect(r.decision).toBe("auto_approve");
    expect(r.rule).toBe("autoSendOffers");
    expect(r.evidence).toContain("40,000");
  });

  it("blocks when over the limit and records reason", () => {
    const limits = { ...DEFAULT_GUARDRAILS, autoSendOffers: { enabled: true, maxOfferAmount: 50_000, dailyCap: 5 } };
    const r = evaluateAction({ kind: "send_offer", requiresApproval: true }, limits, { amount: 60_000, offersToday: 1 });
    expect(r.decision).toBe("block");
    expect(r.reason).toContain("maxOfferAmount");
  });
});