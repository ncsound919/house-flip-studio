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
    underwritings: {},
    ...over,
  };
}

describe("planAgentActions — Lead stage", () => {
  it("queues an ARV estimate when deal has assessed value but no ARV yet", () => {
    const plan = planAgentActions(
      state({ deals: [deal({ arv_estimate: null, assessed_value: 90_000 })] })
    );
    const arv = plan.find((p) => p.kind === "arv_estimate");
    expect(arv).toBeDefined();
    expect(arv!.requires_approval).toBe(false);
    expect(arv!.metadata.arv).toBeGreaterThan(0);
  });

  it("skips ARV estimate when estimate already exists", () => {
    const plan = planAgentActions(
      state({ deals: [deal({ arv_estimate: 250_000, arv_method: "sqft_median" })] })
    );
    expect(plan.find((p) => p.kind === "arv_estimate")).toBeUndefined();
  });

  it("queues underwriting when ARV + asking price exist and no underwriting row", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ arv_estimate: 280_000, arv_method: "sqft_median", asking_price: 200_000 })],
      })
    );
    const uw = plan.find((p) => p.kind === "underwrite");
    expect(uw).toBeDefined();
    expect(uw!.requires_approval).toBe(false);
  });

  it("advances Lead → Inspecting when underwriting passes (non-money gate)", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ arv_estimate: 280_000, arv_method: "sqft_median" })],
        underwritings: {
          d1: { arv: 280_000, max_offer: 130_000, projected_profit: 50_000, passes_70_rule: true },
        },
      })
    );
    const adv = plan.find((p) => p.kind === "advance_stage" && p.metadata.to === "Inspecting");
    expect(adv).toBeDefined();
    expect(adv!.requires_approval).toBe(false);
  });

  it("does NOT advance Lead if underwriting did not pass", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ arv_estimate: 280_000, arv_method: "sqft_median" })],
        underwritings: {
          d1: { arv: 280_000, max_offer: 80_000, projected_profit: -10_000, passes_70_rule: false },
        },
      })
    );
    expect(plan.find((p) => p.kind === "advance_stage" && p.metadata.to === "Inspecting")).toBeUndefined();
  });

  it("emits no actions when deal has no usable data", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ assessed_value: null, sqft: null, asking_price: null })],
      })
    );
    // No arv inputs, no asking price → nothing the agent can do
    expect(plan).toHaveLength(0);
  });
});

describe("planAgentActions — Underwriting stage (money gate)", () => {
  it("proposes advance to Offer Made with requires_approval: true", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Underwriting", arv_estimate: 280_000 })],
        underwritings: {
          d1: { arv: 280_000, max_offer: 130_000, projected_profit: 50_000, passes_70_rule: true },
        },
      })
    );
    const adv = plan.find((p) => p.kind === "advance_stage" && p.metadata.to === "Offer Made");
    expect(adv).toBeDefined();
    expect(adv!.requires_approval).toBe(true);
  });

  it("does not propose advance when underwriting failed", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Underwriting", arv_estimate: 280_000 })],
        underwritings: {
          d1: { arv: 280_000, max_offer: 80_000, projected_profit: -10_000, passes_70_rule: false },
        },
      })
    );
    expect(plan.find((p) => p.kind === "advance_stage" && p.metadata.to === "Offer Made")).toBeUndefined();
  });
});

describe("planAgentActions — Offer Made / Under Contract / Listed (money gates)", () => {
  it("Offer Made always proposes Under Contract advance with approval", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Offer Made" })] }));
    const adv = plan.find((p) => p.kind === "advance_stage" && p.metadata.to === "Under Contract");
    expect(adv).toBeDefined();
    expect(adv!.requires_approval).toBe(true);
  });

  it("Under Contract requests signed_contract and proposes Rehab with approval", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Under Contract" })] }));
    const doc = plan.find(
      (p) => p.kind === "generate_document" && p.metadata.docType === "signed_contract"
    );
    expect(doc).toBeDefined();
    const rehab = plan.find((p) => p.kind === "advance_stage" && p.metadata.to === "Rehab");
    expect(rehab).toBeDefined();
    expect(rehab!.requires_approval).toBe(true);
  });

  it("Listed proposes Closed with approval", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Listed" })] }));
    const adv = plan.find((p) => p.kind === "advance_stage" && p.metadata.to === "Closed");
    expect(adv).toBeDefined();
    expect(adv!.requires_approval).toBe(true);
  });
});

describe("planAgentActions — Inspecting stage", () => {
  it("advances to Underwriting when underwriting passes (non-money)", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Inspecting" })],
        underwritings: {
          d1: { arv: 280_000, max_offer: 130_000, projected_profit: 50_000, passes_70_rule: true },
        },
      })
    );
    const adv = plan.find((p) => p.kind === "advance_stage" && p.metadata.to === "Underwriting");
    expect(adv).toBeDefined();
    expect(adv!.requires_approval).toBe(false);
  });

  it("emits info when awaiting inspection or underwriting data", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Inspecting" })] }));
    const info = plan.find((p) => p.kind === "info");
    expect(info).toBeDefined();
  });
});

describe("planAgentActions — Rehab stage", () => {
  it("requests permit, insurance_cert, w9, and conditional_lien_waiver when missing", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Rehab" })] }));
    const requested = plan
      .filter((p) => p.kind === "generate_document")
      .map((p) => p.metadata.docType);
    expect(requested).toContain("permit");
    expect(requested).toContain("insurance_cert");
    expect(requested).toContain("w9");
    expect(requested).toContain("conditional_lien_waiver");
  });

  it("does not duplicate a document already requested", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        documents: [
          { id: "doc1", deal_id: "d1", rehab_item_id: null, doc_type: "permit", status: "requested", requested_at: null },
        ],
      })
    );
    const permits = plan.filter(
      (p) => p.kind === "generate_document" && p.metadata.docType === "permit"
    );
    expect(permits).toHaveLength(0);
  });

  it("queues a chase_document action for overdue documents (>7 days)", () => {
    const sevenDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        documents: [
          {
            id: "doc1",
            deal_id: "d1",
            rehab_item_id: null,
            doc_type: "permit",
            status: "requested",
            requested_at: sevenDaysAgo,
          },
        ],
      })
    );
    const chase = plan.find((p) => p.kind === "chase_document");
    expect(chase).toBeDefined();
    expect(chase!.requires_approval).toBe(false);
  });

  it("does NOT chase documents received or filed", () => {
    const sevenDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10);
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        documents: [
          {
            id: "doc1",
            deal_id: "d1",
            rehab_item_id: null,
            doc_type: "permit",
            status: "received",
            requested_at: sevenDaysAgo,
          },
        ],
      })
    );
    expect(plan.find((p) => p.kind === "chase_document" && p.documentId === "doc1")).toBeUndefined();
  });

  it("proposes Listed advance when all rehab items are completed (approval-gated)", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        rehabItems: [
          { id: "r1", deal_id: "d1", trade: "Roofing", status: "completed" },
          { id: "r2", deal_id: "d1", trade: "Plumbing", status: "completed" },
        ],
      })
    );
    const adv = plan.find((p) => p.kind === "advance_stage" && p.metadata.to === "Listed");
    expect(adv).toBeDefined();
    expect(adv!.requires_approval).toBe(true);
  });
});

describe("planAgentActions — contractor verification", () => {
  it("queues license verification when license_number present and not verified recently", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        contractors: [
          {
            id: "c1",
            org_id: "org1",
            name: "Acme Roofing",
            email: "acme@x.com",
            trade: "Roofing",
            license_number: "12345",
            insurance_expiry: null,
            verified_at: null,
          },
        ],
      })
    );
    const verify = plan.find((p) => p.kind === "verify_contractor");
    expect(verify).toBeDefined();
    expect(verify!.requires_approval).toBe(false);
  });

  it("queues insurance expiry chase when expiring within 30 days", () => {
    const in15Days = new Date(Date.now() + 15 * 86_400_000).toISOString().slice(0, 10);
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        contractors: [
          {
            id: "c1",
            org_id: "org1",
            name: "Acme",
            email: null,
            trade: "Roofing",
            license_number: "12345",
            insurance_expiry: in15Days,
            verified_at: new Date().toISOString(),
          },
        ],
      })
    );
    const chase = plan.find((p) => p.kind === "chase_document" && p.contractorId === "c1");
    expect(chase).toBeDefined();
  });
});

describe("planAgentActions — money gate integrity", () => {
  it("Closed stage is never processed", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Closed" })] }));
    expect(plan).toHaveLength(0);
  });

  it("every money-gate action explicitly has requires_approval: true", () => {
    const plan = planAgentActions(
      state({
        deals: [
          deal({ stage: "Underwriting" }),
          deal({ id: "d2", stage: "Offer Made" }),
          deal({ id: "d3", stage: "Under Contract" }),
          deal({ id: "d4", stage: "Rehab" }),
        ],
        underwritings: {
          d1: { arv: 280_000, max_offer: 130_000, projected_profit: 50_000, passes_70_rule: true },
        },
      })
    );
    // Every advance_stage to a money-gate target must require approval.
    const moneyTargets = new Set(["Offer Made", "Under Contract", "Rehab", "Closed"]);
    for (const p of plan) {
      if (p.kind === "advance_stage" && p.metadata.to && moneyTargets.has(p.metadata.to as string)) {
        expect(p.requires_approval).toBe(true);
      }
    }
  });
});
