import { describe, it, expect } from "vitest";
import { guardrailLimitsSchema, DEFAULT_GUARDRAILS } from "../lib/guardrails/limits";

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