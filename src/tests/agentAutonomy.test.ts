import { describe, it, expect, vi } from "vitest";
import {
  planAgentActions,
  type PlannerState,
  type PlannerDeal,
} from "../lib/agent/planner";
import { runAgentCycle } from "../lib/agent/runner";

vi.mock("@/lib/apiHelpers", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/apiHelpers";

vi.mock("@/lib/research/sources/deeds", () => ({
  fetchDeedComps: vi.fn(),
}));

import { executeStep } from "../lib/agent/runner";
import { fetchDeedComps } from "../lib/research/sources/deeds";
import { DEFAULT_SETTINGS } from "../lib/orgSettings";

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
    dossiers: new Set<string>(),
    payments: {},
    outreach: [],
    changeOrders: [],
    cadence: { enabled: false, initialFollowUpDays: 7, followUpDays: 14, maxFollowUps: 3, signature: "Jane Operator" },
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
    const prompt = plan.find((p) => p.kind === "fetch_comps" && p.metadata.reason === "comps_missing");
    expect(prompt).toBeDefined();
    expect(prompt!.title).toContain("Fetch real comps");
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

// --- Runner: guardrails live -------------------------------------------------
// A fake admin backed by an in-memory store, mirroring how the runner reads real
// DB state (deals, underwriting, org_settings) and writes agent_actions.

type Row = Record<string, unknown>;
type Store = Record<string, Row[]>;

let rowCounter = 0;

function makeAdmin(store: Store) {
  const build = (table: string) => {
    let rows: Row[] = [...(store[table] ?? [])];
    let mode: "query" | "insert" | "update" | "upsert" | "delete" = "query";
    let insertRows: Row[] = [];
    let patch: Row = {};

    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = (k: string, v: unknown) => {
      rows = rows.filter((r) => r[k] === v);
      return b;
    };
    b.neq = (k: string, v: unknown) => {
      rows = rows.filter((r) => r[k] !== v);
      return b;
    };
    b.in = (k: string, vals: unknown[]) => {
      rows = rows.filter((r) => vals.includes(r[k]));
      return b;
    };
    b.gte = (k: string, v: unknown) => {
      rows = rows.filter((r) => (r[k] as number) >= (v as number));
      return b;
    };
    b.lte = (k: string, v: unknown) => {
      rows = rows.filter((r) => (r[k] as number) <= (v as number));
      return b;
    };
    b.order = (col: string, opts?: { ascending?: boolean }) => {
      rows = [...rows].sort((a, z) => {
        const av = a[col] as string | number | null | undefined;
        const zv = z[col] as string | number | null | undefined;
        if (av == null && zv == null) return 0;
        if (av == null) return 1;
        if (zv == null) return -1;
        if (av < zv) return opts?.ascending === false ? 1 : -1;
        if (av > zv) return opts?.ascending === false ? -1 : 1;
        return 0;
      });
      return b;
    };
    b.limit = (n: number) => {
      rows = rows.slice(0, n);
      return b;
    };
    b.single = async () => ({
      data: mode === "insert" ? insertRows[0] ?? null : rows[0] ?? null,
      error: null,
    });
    b.insert = (row: Row | Row[]) => {
      const toAdd = (Array.isArray(row) ? row : [row]).map((r) => ({
        ...r,
        id: r.id ?? `row-${++rowCounter}`,
      }));
      store[table] = [...(store[table] ?? []), ...toAdd];
      insertRows = toAdd;
      mode = "insert";
      return b;
    };
    b.update = (p: Row) => {
      patch = p;
      mode = "update";
      return b;
    };
    b.upsert = (row: Row, opts?: { onConflict?: string }) => {
      const col = opts?.onConflict ?? "id";
      const arr = store[table] ?? [];
      const idx = arr.findIndex((r) => r[col] === row[col]);
      if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
      else arr.push({ ...row });
      store[table] = arr;
      mode = "upsert";
      return b;
    };
    b.delete = () => {
      mode = "delete";
      return b;
    };
    b.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      const result = (async () => {
        if (mode === "insert") return { data: insertRows, error: null };
        if (mode === "update") {
          for (const r of rows) Object.assign(r, patch);
          return { data: rows, error: null };
        }
        if (mode === "delete") {
          const ids = rows.map((r) => r.id);
          store[table] = (store[table] ?? []).filter((r) => !ids.includes(r.id));
          return { data: null, error: null };
        }
        return { data: rows, error: null };
      })();
      return result.then(resolve, reject);
    };
    return b;
  };
  return { from: (table: string) => build(table) };
}

function mockAdmin(store: Store) {
  vi.mocked(createAdminClient).mockReturnValue(makeAdmin(store) as never);
}

// A deal in Underwriting passing the 70% rule, so the planner emits the
// advance_stage → Offer Made money gate. huntOnCycle off to isolate planning.
function gateStore(limits?: Record<string, unknown>): Store {
  return {
    org_settings: [
      {
        org_id: "org1",
        data: { agent: { huntOnCycle: false, ...(limits ? { limits } : {}) } },
      },
    ],
    deals: [
      {
        id: "d1",
        org_id: "org1",
        address: "1 Main St",
        city: "Charlotte",
        stage: "Underwriting",
        asking_price: 200_000,
        sqft: 1500,
        year_built: 1970,
        assessed_value: 90_000,
        arv_estimate: 280_000,
        arv_method: "comps",
      },
    ],
    underwriting: [
      {
        id: "u1",
        deal_id: "d1",
        arv: 280_000,
        max_offer: 45_000,
        projected_profit: 20_000,
        passes_70_rule: true,
      },
    ],
    rehab_items: [{ id: "r1", org_id: "org1", deal_id: "d1", trade: "Roofing", status: "estimated" }],
    comps: [{ id: "c1", deal_id: "d1", sale_price: 270_000 }],
  };
}

describe("runner — guardrails live", () => {
  it("auto-approves a money action within limits and records auto_approved", async () => {
    const store = gateStore({
      autoSendOffers: { enabled: true, maxOfferAmount: 50_000, dailyCap: 5 },
    });
    mockAdmin(store);

    const result = await runAgentCycle({ orgId: "org1", trigger: "manual", executeMoneyActions: false });

    const deal = store.deals.find((d) => d.id === "d1");
    expect(deal?.stage).toBe("Offer Made"); // world-state mutated by guardrail auth
    const auto = store.agent_actions?.find(
      (a) => a.action_type === "advance_stage" && a.status === "auto_approved"
    );
    expect(auto).toBeDefined();
    expect((auto?.metadata as Record<string, unknown>).guardrailRule).toBe("autoSendOffers");
    expect((auto?.metadata as Record<string, unknown>).guardrailEvidence).toContain("45,000");
    expect(result.moneyGatesAwaiting).toBe(0);
  });

  it("escalates a money action to pending_approval when the guardrail is disabled", async () => {
    const store = gateStore();
    mockAdmin(store);

    const result = await runAgentCycle({ orgId: "org1", trigger: "manual", executeMoneyActions: false });

    const deal = store.deals.find((d) => d.id === "d1");
    expect(deal?.stage).toBe("Underwriting"); // NOT advanced
    const pend = store.agent_actions?.find(
      (a) => a.action_type === "advance_stage" && a.status === "pending_approval"
    );
    expect(pend).toBeDefined();
    expect(result.moneyGatesAwaiting).toBe(1);
  });

  it("blocks a money action over the limit and does not advance the deal", async () => {
    const store = gateStore({
      autoSendOffers: { enabled: true, maxOfferAmount: 30_000, dailyCap: 5 },
    });
    mockAdmin(store);

    const result = await runAgentCycle({ orgId: "org1", trigger: "manual", executeMoneyActions: false });

    const deal = store.deals.find((d) => d.id === "d1");
    expect(deal?.stage).toBe("Underwriting"); // NOT advanced
    const blocked = store.agent_actions?.find(
      (a) => a.action_type === "advance_stage" && a.status === "blocked"
    );
    expect(blocked).toBeDefined();
    expect((blocked?.metadata as Record<string, unknown>).guardrailReason).toContain("maxOfferAmount");
    expect(result.moneyGatesAwaiting).toBe(0);
  });
});

describe("runner — Phase 3 handlers", () => {
  const baseDeal = {
    id: "d1",
    org_id: "org1",
    address: "1 Main St",
    city: "Charlotte",
    asking_price: null,
    sqft: 1200,
    year_built: 1970,
    assessed_value: null,
    arv_estimate: 250_000,
    arv_method: "sqft_median",
  };

  it("fetch_dossier enqueues a job and records done", async () => {
    const store: Store = {
      org_settings: [{ org_id: "org1", data: { agent: { huntOnCycle: false } } }],
      deals: [
        {
          ...baseDeal,
          stage: "Lead",
          assessed_value: null,
          sqft: null,
          arv_estimate: null,
          arv_method: null,
        },
      ],
    };
    mockAdmin(store);

    await runAgentCycle({ orgId: "org1", trigger: "manual" });

    const fd = store.agent_actions?.find(
      (a) => a.action_type === "fetch_dossier" && a.status === "done"
    );
    expect(fd).toBeDefined();
    expect((fd?.metadata as Record<string, unknown>).queued).toBe(true);
    expect(
      store.agent_jobs?.some((j) => j.kind === "fetch_dossier" && j.deal_id === "d1" && j.status === "pending")
    ).toBe(true);
  });

  it("schedule_inspection records a proposal (auto=false by default)", async () => {
    const store: Store = {
      org_settings: [{ org_id: "org1", data: { agent: { huntOnCycle: false } } }],
      deals: [{ ...baseDeal, stage: "Inspecting", assessed_value: 90_000 }],
      rehab_items: [{ id: "r1", org_id: "org1", deal_id: "d1", trade: "Roofing", status: "estimated" }],
    };
    mockAdmin(store);

    await runAgentCycle({ orgId: "org1", trigger: "manual" });

    const si = store.agent_actions?.find(
      (a) => a.action_type === "schedule_inspection" && a.status === "done"
    );
    expect(si).toBeDefined();
    expect((si?.metadata as Record<string, unknown>).auto).toBe(false);
    expect((si?.metadata as Record<string, unknown>).requiresOperator).toBe(true);
  });

  it("record_payment inserts a recorded draw from the item cost", async () => {
    const store: Store = {
      org_settings: [{ org_id: "org1", data: { agent: { huntOnCycle: false } } }],
      deals: [{ ...baseDeal, stage: "Rehab" }],
      rehab_items: [
        { id: "r1", org_id: "org1", deal_id: "d1", trade: "Roofing", status: "contracted", estimated_cost: 8_000, actual_cost: 0 },
      ],
    };
    mockAdmin(store);

    await runAgentCycle({ orgId: "org1", trigger: "manual" });

    const rp = store.agent_actions?.find(
      (a) => a.action_type === "record_payment" && a.status === "done"
    );
    expect(rp).toBeDefined();
    const pay = store.payments?.find((p) => p.deal_id === "d1");
    expect(pay).toBeDefined();
    expect(pay?.amount).toBe(8_000);
    expect(pay?.status).toBe("recorded");
  });

  it("approve_payment auto-approves a draw within autoSpendRehab limits", async () => {
    const store: Store = {
      org_settings: [
        {
          org_id: "org1",
          data: {
            agent: {
              huntOnCycle: false,
              limits: { autoSpendRehab: { enabled: true, monthlyCap: 100_000 } },
            },
          },
        },
      ],
      deals: [{ ...baseDeal, stage: "Rehab" }],
      payments: [{ id: "p1", org_id: "org1", deal_id: "d1", rehab_item_id: "r1", amount: 5_000, status: "recorded" }],
    };
    mockAdmin(store);

    await runAgentCycle({ orgId: "org1", trigger: "manual", executeMoneyActions: false });

    expect(store.payments?.find((p) => p.id === "p1")?.status).toBe("approved");
    const ap = store.agent_actions?.find(
      (a) => a.action_type === "approve_payment" && a.status === "auto_approved"
    );
    expect(ap).toBeDefined();
    expect((ap?.metadata as Record<string, unknown>).guardrailRule).toBe("autoSpendRehab");
  });

  it("approve_payment escalates when autoSpendRehab is disabled", async () => {
    const store: Store = {
      org_settings: [{ org_id: "org1", data: { agent: { huntOnCycle: false } } }],
      deals: [{ ...baseDeal, stage: "Rehab" }],
      payments: [{ id: "p1", org_id: "org1", deal_id: "d1", rehab_item_id: "r1", amount: 5_000, status: "recorded" }],
    };
    mockAdmin(store);

    await runAgentCycle({ orgId: "org1", trigger: "manual", executeMoneyActions: false });

    expect(store.payments?.find((p) => p.id === "p1")?.status).toBe("recorded");
    const ap = store.agent_actions?.find(
      (a) => a.action_type === "approve_payment" && a.status === "pending_approval"
    );
    expect(ap).toBeDefined();
  });

  it("recommend_list_price computes max(arv, comps median × 1.02)", async () => {
    const store: Store = {
      org_settings: [{ org_id: "org1", data: { agent: { huntOnCycle: false } } }],
      deals: [{ ...baseDeal, stage: "Rehab", arv_estimate: 150_000 }],
      rehab_items: [{ id: "r1", org_id: "org1", deal_id: "d1", trade: "Roofing", status: "completed" }],
      comps: [
        { id: "c1", deal_id: "d1", sale_price: 180_000 },
        { id: "c2", deal_id: "d1", sale_price: 200_000 },
        { id: "c3", deal_id: "d1", sale_price: 220_000 },
      ],
    };
    mockAdmin(store);

    await runAgentCycle({ orgId: "org1", trigger: "manual" });

    const rl = store.agent_actions?.find(
      (a) => a.action_type === "recommend_list_price" && a.status === "done"
    );
    expect(rl).toBeDefined();
    expect((rl?.metadata as Record<string, unknown>).listPrice).toBe(204_000);
    expect((rl?.metadata as Record<string, unknown>).source).toContain("comps median");
  });

  it("predict_exit records timeline + projected proceeds", async () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const store: Store = {
      org_settings: [{ org_id: "org1", data: { agent: { huntOnCycle: false } } }],
      deals: [{ ...baseDeal, stage: "Rehab", stage_changed_at: tenDaysAgo }],
      underwriting: [{ id: "u1", deal_id: "d1", arv: 250_000, total_project_cost: 150_000 }],
    };
    mockAdmin(store);

    await runAgentCycle({ orgId: "org1", trigger: "manual" });

    const pe = store.agent_actions?.find(
      (a) => a.action_type === "predict_exit" && a.status === "done"
    );
    expect(pe).toBeDefined();
    expect((pe?.metadata as Record<string, unknown>).projectedProceeds).toBe(100_000);
    expect((pe?.metadata as Record<string, unknown>).timelineDays).toBe(70);
  });
});

describe("executeStep — fetch_comps (mocked deed feed)", () => {
  function makeStepAdmin(deal?: { id: string; org_id: string; address: string }) {
    const inserted: { table: string; rows: unknown[] }[] = [];
    const admin = {
      from: (table: string) => {
        const t = table as string;
        return {
          select: () => ({
            eq: (_k: string, _v: string) => ({
              single: async () => ({ data: deal ?? null, error: null }),
            }),
          }),
          insert: async (rows: unknown) => {
            inserted.push({ table: t, rows: Array.isArray(rows) ? rows : [rows] });
            return { error: null };
          },
        };
      },
    };
    return { admin, inserted };
  }

  const fetchStep = {
    kind: "fetch_comps",
    dealId: "d1",
    title: "Fetch real comps for 123 Test St",
    detail: "ARV is sqft_median. Agent will pull deed-transfer comps.",
    requires_approval: false,
    metadata: { reason: "comps_missing", compCount: 0 },
  };

  it("inserts deed comps into the comps table and records done with inserted count", async () => {
    const { admin, inserted } = makeStepAdmin({ id: "d1", org_id: "org1", address: "123 Test St" });
    vi.mocked(fetchDeedComps).mockResolvedValue({
      source: "deeds",
      status: "ok",
      fetchedAt: new Date().toISOString(),
      data: [
        { sale_price: 200_000, sale_date: "2026-05-01", source: "deeds" },
        { sale_price: 210_000, sale_date: "2026-04-15", source: "deeds" },
      ],
    });

    const res = await executeStep(
      admin as never,
      "org1",
      "run1",
      fetchStep as never,
      { executeMoneyActions: false, settings: DEFAULT_SETTINGS }
    );
    expect(res.status).toBe("done");

    const comps = inserted.find((i) => i.table === "comps");
    expect(comps).toBeDefined();
    expect(comps!.rows).toHaveLength(2);
    expect(comps!.rows[0]).toMatchObject({ deal_id: "d1", sale_price: 200_000, source: "deeds" });

    const actions = inserted.filter((i) => i.table === "agent_actions");
    const last = actions[actions.length - 1].rows[actions.length - 1] as {
      status: string;
      metadata: { inserted?: number };
    };
    expect(last.status).toBe("done");
    expect(last.metadata.inserted).toBe(2);
  });

  it("records failed when the deed feed returns no comps", async () => {
    const { admin, inserted } = makeStepAdmin({ id: "d1", org_id: "org1", address: "123 Test St" });
    vi.mocked(fetchDeedComps).mockResolvedValue({
      source: "deeds",
      status: "error",
      fetchedAt: new Date().toISOString(),
      error: "NC_DEEDS_ENDPOINT not configured",
    });

    const res = await executeStep(
      admin as never,
      "org1",
      "run1",
      fetchStep as never,
      { executeMoneyActions: false, settings: DEFAULT_SETTINGS }
    );
    expect(res.status).toBe("failed");

    const actions = inserted.filter((i) => i.table === "agent_actions");
    const last = actions[actions.length - 1].rows[actions.length - 1] as { status: string };
    expect(last.status).toBe("failed");
  });

  it("skips when the deal is missing or belongs to another org", async () => {
    const { admin } = makeStepAdmin({ id: "d1", org_id: "other-org", address: "123 Test St" });
    const res = await executeStep(
      admin as never,
      "org1",
      "run1",
      fetchStep as never,
      { executeMoneyActions: false, settings: DEFAULT_SETTINGS }
    );
    expect(res.status).toBe("skipped");
  });
});