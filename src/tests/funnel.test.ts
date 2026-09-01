import { describe, it, expect } from "vitest";
import { computeAcquisitionFunnel } from "../lib/outreach/funnel";

describe("computeAcquisitionFunnel", () => {
  it("derives conversion from real deal stages and outreach rows", () => {
    const f = computeAcquisitionFunnel({
      deals: [
        { id: "a", stage: "Lead" },
        { id: "b", stage: "Lead" },
        { id: "c", stage: "Offer Made" },
        { id: "d", stage: "Under Contract" },
        { id: "e", stage: "Closed" },
      ],
      outreach: [
        // b: contacted, no response
        { deal_id: "b", direction: "outbound", status: "sent", kind: "initial_offer", response: "none" },
        // c: contacted + responded + offer sent
        { deal_id: "c", direction: "outbound", status: "sent", kind: "initial_offer", response: "none" },
        { deal_id: "c", direction: "inbound", status: "sent", kind: "note", response: "counter" },
      ],
    });
    expect(f.leads).toBe(5);
    expect(f.contacted).toBe(2); // b, c
    expect(f.responded).toBe(1); // c
    expect(f.offered).toBe(4); // b (sent offer), c, d, e
    expect(f.contracted).toBe(2); // d, e
    expect(f.closed).toBe(1); // e
    expect(f.conversion.contactedPct).toBe(40);
    expect(f.conversion.respondedPct).toBe(20);
    expect(f.conversion.closedPct).toBe(20);
  });

  it("returns zeros when no deals exist", () => {
    const f = computeAcquisitionFunnel({ deals: [], outreach: [] });
    expect(f.leads).toBe(0);
    expect(f.conversion.contactedPct).toBe(0);
  });

  it("only counts real sent rows as contacted (drafts are not contact)", () => {
    const f = computeAcquisitionFunnel({
      deals: [{ id: "a", stage: "Lead" }],
      outreach: [{ deal_id: "a", direction: "outbound", status: "draft", kind: "initial_offer", response: "none" }],
    });
    expect(f.contacted).toBe(0);
  });
});
