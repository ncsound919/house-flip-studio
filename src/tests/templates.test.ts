import { describe, it, expect } from "vitest";
import { buildOfferEmail, buildFollowUpEmail } from "../lib/outreach/templates";

describe("outreach templates", () => {
  const ctx = {
    owner: "GARNER, LYNN G",
    address: "454 DREWETT STORE RD",
    assessedValue: 94_844,
    signature: "Jane Operator",
    phone: "919-555-0100",
  };

  it("builds a personalized offer email from real county data", () => {
    const { subject, body } = buildOfferEmail(ctx);
    expect(subject).toContain("454 DREWETT STORE RD");
    expect(body).toContain("the GARNER family");
    expect(body).toContain("$94,844");
    expect(body).toContain("Jane Operator");
  });

  it("does not fabricate an assessed value when absent", () => {
    const { body } = buildOfferEmail({ ...ctx, assessedValue: null });
    expect(body).not.toContain("$94,844");
    expect(body).not.toContain("assessed value");
  });

  it("falls back to a neutral greeting when owner is unknown", () => {
    const { body } = buildOfferEmail({ ...ctx, owner: null });
    expect(body).toContain("Hello Homeowner");
  });

  it("builds a sequence-aware follow-up", () => {
    const { subject, body } = buildFollowUpEmail(ctx, 2);
    expect(subject).toContain("454 DREWETT STORE RD");
    expect(body).toContain("454 DREWETT STORE RD");
  });
});
