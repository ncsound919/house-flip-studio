import { describe, it, expect } from "vitest";
import {
  planAgentActions,
  type PlannerState,
  type PlannerDeal,
} from "../lib/agent/planner";

function deal(over: Partial<PlannerDeal> = {}): PlannerDeal {
  return {
    id: "d1",
    org_id: "org1",
    address: "123 Test St",
    city: "Charlotte",
    stage: "Lead",
    asking_price: 200_000,
    sqft: 1500,
    year_built: 1970,
    assessed_value: 90_000,
    arv_estimate: null,
    arv_method: null,
    ...over,
  };
}

function state(over: Partial<PlannerState> = {}): PlannerState {
  return {
    orgId: "org1",
    deals: [],
    documents: [],
    rehabItems: [],
    contractors: [],
    rfqDrafts: [],
    pendingGates: [],
    recentChases: [],
    comps: {},
    underwritings: {},
    ...over,
  };
}

const verifiedContractor = {
  id: "c1",
  org_id: "org1",
  name: "Acme Roofing",
  email: "acme@x.com",
  trade: "Roofing",
  license_number: "12345",
  insurance_expiry: null,
  verified_at: new Date().toISOString(),
  license_checked_at: new Date().toISOString(),
};

describe("planAgentActions — generate_scope", () => {
  it("emits generate_scope for Inspecting deals with no rehab scope", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Inspecting" })] }));
    expect(plan.some((p) => p.kind === "generate_scope")).toBe(true);
  });

  it("emits generate_scope for Underwriting deals with no rehab scope", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Underwriting" })] }));
    expect(plan.some((p) => p.kind === "generate_scope")).toBe(true);
  });

  it("skips generate_scope when rehab items already exist", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Inspecting" })],
        rehabItems: [{ id: "r1", deal_id: "d1", trade: "Roofing", status: "estimated" }],
      })
    );
    expect(plan.some((p) => p.kind === "generate_scope")).toBe(false);
  });
});

describe("planAgentActions — draft_rfq", () => {
  it("drafts an RFQ for a verified contractor on a Rehab deal with scope", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        contractors: [verifiedContractor],
        rehabItems: [
          { id: "r1", deal_id: "d1", trade: "Roofing", status: "estimated" },
          { id: "r2", deal_id: "d1", trade: "Plumbing", status: "estimated" },
        ],
      })
    );
    const rfq = plan.find((p) => p.kind === "draft_rfq");
    expect(rfq).toBeDefined();
    expect(rfq!.contractorId).toBe("c1");
    expect(rfq!.requires_approval).toBe(false); // draft only, send stays gated
  });

  it("does not duplicate an RFQ already drafted for the same deal+contractor", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        contractors: [verifiedContractor],
        rehabItems: [{ id: "r1", deal_id: "d1", trade: "Roofing", status: "estimated" }],
        rfqDrafts: [{ id: "rfq1", deal_id: "d1", contractor_id: "c1" }],
      })
    );
    expect(plan.some((p) => p.kind === "draft_rfq")).toBe(false);
  });

  it("does not draft for an unverified contractor", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        contractors: [{ ...verifiedContractor, verified_at: null }],
        rehabItems: [{ id: "r1", deal_id: "d1", trade: "Roofing", status: "estimated" }],
      })
    );
    expect(plan.some((p) => p.kind === "draft_rfq")).toBe(false);
  });
});

describe("planAgentActions — comps-driven ARV", () => {
  it("uses comps for ARV when 2+ real comps are on file", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ arv_estimate: null })],
        comps: { d1: [{ sale_price: 200_000 }, { sale_price: 220_000 }] },
      })
    );
    const arv = plan.find((p) => p.kind === "arv_estimate");
    expect(arv).toBeDefined();
    expect(arv!.metadata.source).toBe("comps");
    expect(arv!.metadata.arv).toBe(210_000);
    expect(arv!.metadata.compCount).toBe(2);
  });

  it("emits fetch_comps when ARV is heuristic and none are on file", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Inspecting", arv_estimate: 250_000, arv_method: "combined" })],
      })
    );
    const fc = plan.find((p) => p.kind === "fetch_comps" && p.metadata.reason === "comps_missing");
    expect(fc).toBeDefined();
    expect(fc!.title).toContain("Fetch real comps");
    expect(fc!.requires_approval).toBe(false);
  });
});

describe("planAgentActions — contractor verification cooldown", () => {
  it("skips re-verification when checked within the last 24h and not verified", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        contractors: [
          {
            ...verifiedContractor,
            verified_at: null,
            license_checked_at: new Date().toISOString(),
          },
        ],
      })
    );
    expect(plan.some((p) => p.kind === "verify_contractor")).toBe(false);
  });

  it("re-verifies when the last check is older than 24h and not verified", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        contractors: [
          {
            ...verifiedContractor,
            verified_at: null,
            license_checked_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
          },
        ],
      })
    );
    expect(plan.some((p) => p.kind === "verify_contractor")).toBe(true);
  });
});

describe("planAgentActions — pending-gate dedup", () => {
  it("does not stack a second Offer Made gate when one already awaits approval", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Underwriting", arv_estimate: 280_000 })],
        underwritings: {
          d1: { arv: 280_000, max_offer: 130_000, projected_profit: 50_000, passes_70_rule: true },
        },
        pendingGates: [{ dealId: "d1", kind: "advance_stage", to: "Offer Made" }],
      })
    );
    const gates = plan.filter((p) => p.kind === "advance_stage" && p.metadata.to === "Offer Made");
    expect(gates).toHaveLength(0);
  });

  it("emits the gate when no pending one exists", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Underwriting", arv_estimate: 280_000 })],
        underwritings: {
          d1: { arv: 280_000, max_offer: 130_000, projected_profit: 50_000, passes_70_rule: true },
        },
      })
    );
    const gates = plan.filter((p) => p.kind === "advance_stage" && p.metadata.to === "Offer Made");
    expect(gates).toHaveLength(1);
    expect(gates[0].requires_approval).toBe(true);
  });
});

describe("planAgentActions — run-level contractor oversight", () => {
  it("verifies a contractor once per run even across multiple Rehab deals", () => {
    const plan = planAgentActions(
      state({
        deals: [
          deal({ stage: "Rehab" }),
          deal({ id: "d2", stage: "Rehab" }),
          deal({ id: "d3", stage: "Rehab" }),
        ],
        contractors: [
          {
            ...verifiedContractor,
            verified_at: null,
            license_checked_at: null,
          },
        ],
      })
    );
    const verifies = plan.filter((p) => p.kind === "verify_contractor" && p.contractorId === "c1");
    expect(verifies).toHaveLength(1);
  });

  it("does not re-chase insurance within the 7-day cooldown", () => {
    const in15Days = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    const plan = planAgentActions(
      state({
        contractors: [
          {
            ...verifiedContractor,
            insurance_expiry: in15Days,
          },
        ],
        recentChases: [{ contractorId: "c1", at: new Date().toISOString() }],
      })
    );
    expect(plan.some((p) => p.kind === "chase_document" && p.contractorId === "c1")).toBe(false);
  });

  it("chases insurance when no recent chase exists", () => {
    const in15Days = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    const plan = planAgentActions(
      state({
        contractors: [
          {
            ...verifiedContractor,
            insurance_expiry: in15Days,
          },
        ],
      })
    );
    expect(plan.some((p) => p.kind === "chase_document" && p.contractorId === "c1")).toBe(true);
  });
});