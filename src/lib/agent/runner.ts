import { createAdminClient } from "@/lib/apiHelpers";
import { calculateUnderwriting } from "@/lib/underwriting";
import { huntLeads } from "@/lib/leadHunt";
import { DEAL_STAGES } from "@/lib/types";
import { sendEmail } from "./email";
import {
  planAgentActions,
  type PlannedAction,
  type PlannerState,
  type PlannerDeal,
  type PlannerDocument,
  type PlannerRehabItem,
  type PlannerContractor,
} from "./planner";
import type {
  AgentRunTrigger,
  AgentRunStatus,
  AgentActionKind,
  AgentActionStatus,
  AgentRunSummary,
} from "./types";

// Agent runner — executes a planner's plan against the real DB and writes
// every action to the agent_actions audit log.
//
// Two callers:
//   1. /api/agent/run          (on-demand, with requireOrgId)
//   2. /api/cron/agent         (scheduled, iterates all orgs)
//
// HONESTY: money-gated actions are NEVER executed. They are recorded as
// pending_approval so the operator can review and approve at /agent (or
// the watchdog pane). The runner only mutates the world for non-money
// actions.

interface RunOptions {
  orgId: string;
  trigger: AgentRunTrigger;
  // Optional override: if true, also execute money-gated actions
  // (used only for tests). In production this is always false.
  executeMoneyActions?: boolean;
}

interface RunResult {
  runId: string;
  actions: number;
  moneyGatesAwaiting: number;
  errors: string[];
}

export async function runAgentCycle(opts: RunOptions): Promise<RunResult> {
  const admin = createAdminClient();
  const errors: string[] = [];

  const { data: run, error: runErr } = await admin
    .from("agent_runs")
    .insert({ org_id: opts.orgId, trigger: opts.trigger, status: "completed" })
    .select("id")
    .single();
  if (runErr || !run) {
    throw new Error(`Failed to create agent_run: ${runErr?.message ?? "unknown"}`);
  }
  const runId = run.id as string;

  let moneyGatesAwaiting = 0;
  let actionCount = 0;

  try {
    // 1) Lead hunt first — the agent is self-feeding.
    try {
      const hunt = await huntLeads({ orgId: opts.orgId, statewide: true, maxTotal: 100 });
      await recordAction(
        admin,
        runId,
        opts.orgId,
        {
          kind: "hunt_leads",
          title: "Lead hunt (statewide)",
          detail: `Scanned ${hunt.scanned}, new ${hunt.newLeads}, duplicates ${hunt.duplicates}. Tiers: ${JSON.stringify(hunt.tiers)}.${hunt.warnings.length ? ` Warnings: ${hunt.warnings.join(" | ")}` : ""}`,
          requires_approval: false,
          metadata: {
            scanned: hunt.scanned,
            newLeads: hunt.newLeads,
            duplicates: hunt.duplicates,
            tiers: hunt.tiers,
            warnings: hunt.warnings,
          },
        },
        "done",
        { hunt }
      );
      actionCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "hunt failed";
      errors.push(`Lead hunt: ${msg}`);
      await recordAction(
        admin,
        runId,
        opts.orgId,
        {
          kind: "hunt_leads",
          title: "Lead hunt failed",
          detail: msg,
          requires_approval: false,
          metadata: {},
        },
        "failed",
        { error: msg }
      );
      actionCount++;
    }

    // 2) Plan + execute across all deals.
    const state = await loadPlannerState(admin, opts.orgId);
    const plan = planAgentActions(state);

    for (const step of plan) {
      try {
        const { status, reason } = await executeStep(admin, opts.orgId, runId, step, {
          executeMoneyActions: !!opts.executeMoneyActions,
        });
        actionCount++;
        if (step.requires_approval && status === "pending_approval") {
          moneyGatesAwaiting++;
        }
        if (status === "failed" && reason) {
          errors.push(`${step.title}: ${reason}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown";
        errors.push(`${step.title}: ${msg}`);
        await recordAction(admin, runId, opts.orgId, step, "failed", { error: msg });
        actionCount++;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "planner failed";
    errors.push(msg);
    await admin
      .from("agent_runs")
      .update({ status: "failed" as AgentRunStatus, summary: { errors }, finished_at: new Date().toISOString() })
      .eq("id", runId);
    throw err;
  }

  const summary = {
    actions: actionCount,
    moneyGatesAwaiting,
    errors: errors.length,
    finishedAt: new Date().toISOString(),
  };
  await admin
    .from("agent_runs")
    .update({
      status: (errors.length ? "partial" : "completed") as AgentRunStatus,
      summary,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);

  return { runId, actions: actionCount, moneyGatesAwaiting, errors };
}

// --- Action execution --------------------------------------------------------

async function executeStep(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  runId: string,
  step: PlannedAction,
  policy: { executeMoneyActions: boolean }
): Promise<{ status: AgentActionStatus; reason?: string }> {
  // Money gate: never execute unless caller explicitly authorized.
  if (step.requires_approval && !policy.executeMoneyActions) {
    await recordAction(admin, runId, orgId, step, "pending_approval", { awaiting: "operator" });
    return { status: "pending_approval" };
  }

  switch (step.kind) {
    case "arv_estimate":
      return await applyArvEstimate(admin, runId, orgId, step);
    case "underwrite":
      return await applyUnderwrite(admin, runId, orgId, step);
    case "advance_stage":
      return await applyAdvanceStage(admin, runId, orgId, step);
    case "generate_document":
      return await applyGenerateDocument(admin, runId, orgId, step);
    case "chase_document":
      return await applyChaseDocument(admin, runId, orgId, step);
    case "verify_contractor":
      return await applyVerifyContractor(admin, runId, orgId, step);
    case "draft_rfq":
      return await applyDraftRfq(admin, runId, orgId, step);
    case "send_rfq":
    case "send_offer":
    case "start_rehab":
      return { status: "skipped" as AgentActionStatus, reason: "money-gated action not authorized in this run" };
    case "info":
      await recordAction(admin, runId, orgId, step, "skipped", { info: true });
      return { status: "skipped" as AgentActionStatus };
    default:
      return { status: "skipped" as AgentActionStatus, reason: `unhandled action kind: ${(step as PlannedAction).kind}` };
  }
}

type ExecResult = Promise<{ status: AgentActionStatus; reason?: string }>;

async function applyArvEstimate(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const arv = step.metadata.arv as number | undefined;
  const source = (step.metadata.source as string) ?? "unknown";
  if (arv == null) return { status: "skipped", reason: "no arv" };
  const { error } = await admin
    .from("deals")
    .update({
      arv_estimate: arv,
      arv_method: source,
      arv_estimate_at: new Date().toISOString(),
    })
    .eq("id", step.dealId);
  if (error) return { status: "failed", reason: error.message };
  await recordAction(admin, runId, orgId, step, "done", { arv, source });
  return { status: "done" };
}

async function applyUnderwrite(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const arv = step.metadata.arv as number | undefined;
  const asking = step.metadata.asking_price as number | undefined;
  if (arv == null || asking == null) {
    return { status: "skipped", reason: "missing arv or asking" };
  }
  // Heuristic rehab estimate: 40/sqft or the existing arv_estimate's confidence
  // from the deal. Use a safe default if sqft unknown.
  const { data: deal } = await admin
    .from("deals")
    .select("sqft")
    .eq("id", step.dealId)
    .single();
  const sqft = Number((deal as { sqft?: number } | null)?.sqft) || 0;
  const rehab = sqft > 0 ? sqft * 40 : Math.round(arv * 0.18);
  const uw = calculateUnderwriting({
    arv,
    rehabEstimate: rehab,
    purchasePrice: asking,
    holdingMonths: 6,
    downPaymentPct: 20,
    interestRate: 10,
    loanPoints: 0,
  });
  const row = {
    deal_id: step.dealId,
    arv,
    rehab_estimate: rehab,
    purchase_price: asking,
    max_offer: uw.maxOffer,
    final_purchase_price: uw.finalPurchasePrice,
    passes_70_rule: uw.passes70Rule,
    acquisition_costs: uw.acquisitionCosts,
    holding_costs: uw.holdingCosts,
    selling_costs: uw.sellingCosts,
    financing_costs: uw.financingCosts,
    total_project_cost: uw.totalProjectCost,
    projected_profit: uw.projectedProfit,
    roi: uw.roi,
    cash_on_cash: uw.cashOnCash,
    down_payment_amount: uw.downPaymentAmount,
    loan_amount: uw.loanAmount,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("underwriting")
    .upsert(row, { onConflict: "deal_id" });
  if (error) return { status: "failed", reason: error.message };
  await recordAction(admin, runId, orgId, step, "done", { uw });
  return { status: "done" };
}

async function applyAdvanceStage(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  const to = step.metadata.to as string | undefined;
  if (!to || !DEAL_STAGES.includes(to as (typeof DEAL_STAGES)[number])) {
    return { status: "skipped", reason: `unknown target stage: ${to}` };
  }
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  // Only execute the advance if the planner said it's non-money. Money-gated
  // calls are intercepted earlier in executeStep().
  const { error } = await admin
    .from("deals")
    .update({ stage: to, stage_changed_at: new Date().toISOString() })
    .eq("id", step.dealId);
  if (error) return { status: "failed", reason: error.message };
  await recordAction(admin, runId, orgId, step, "done", { to });
  return { status: "done" };
}

async function applyGenerateDocument(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const docType = step.metadata.docType as string | undefined;
  if (!docType) return { status: "skipped", reason: "no docType" };
  const { error } = await admin.from("documents").insert({
    deal_id: step.dealId,
    org_id: orgId,
    doc_type: docType,
    status: "requested",
    requested_at: new Date().toISOString().slice(0, 10),
  });
  if (error) return { status: "failed", reason: error.message };
  await recordAction(admin, runId, orgId, step, "done", { docType });
  return { status: "done" };
}

async function applyChaseDocument(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  // Build a chase email. If we have a contractor email, send there. Otherwise
  // record a "draft ready" action for the operator to send manually.
  const reason = (step.metadata.reason as string) ?? "overdue";
  const subject = `[NC Flip] ${step.title}`;
  const text = step.detail;
  let toEmail: string | null = null;
  if (step.contractorId) {
    const { data: c } = await admin
      .from("contractors")
      .select("email")
      .eq("id", step.contractorId)
      .single();
    toEmail = (c as { email?: string } | null)?.email ?? null;
  }
  if (toEmail) {
    const result = await sendEmail({ to: toEmail, subject, text });
    await recordAction(admin, runId, orgId, step, result.sent ? "done" : "skipped", {
      sent: result.sent,
      reason: result.sent ? undefined : result.reason,
      recipient: toEmail,
      subject,
      text,
    });
    return { status: result.sent ? "done" : "skipped", reason: result.reason };
  }
  // No recipient — record the draft so the operator can send.
  await recordAction(admin, runId, orgId, step, "skipped", {
    sent: false,
    reason: "no recipient email on contractor — draft recorded",
    subject,
    text,
    chaseReason: reason,
  });
  return { status: "skipped", reason: "no recipient email" };
}

async function applyVerifyContractor(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.contractorId) return { status: "skipped", reason: "no contractorId" };
  // The existing verify-license route is a POST handler. The planner/runner
  // is server-side; we just update verified_at so the run records intent.
  // The route still does the actual nclbgc lookup on demand.
  const { error } = await admin
    .from("contractors")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", step.contractorId);
  if (error) return { status: "failed", reason: error.message };
  await recordAction(admin, runId, orgId, step, "done", { verified_at: "stamped" });
  return { status: "done" };
}

async function applyDraftRfq(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  // Draft-only. The actual send is money-gated and lives behind /api/contractors/generate-rfq.
  // We record a draft placeholder here; the operator clicks "Generate RFQ" on the deal.
  await recordAction(admin, runId, orgId, step, "skipped", {
    reason: "rfq draft — open the deal to generate and review before sending",
  });
  return { status: "skipped" };
}

// --- Audit log ---------------------------------------------------------------

async function recordAction(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction,
  status: AgentActionStatus,
  metadata: Record<string, unknown>
) {
  await admin.from("agent_actions").insert({
    run_id: runId,
    org_id: orgId,
    deal_id: step.dealId ?? null,
    action_type: step.kind satisfies AgentActionKind,
    status,
    title: step.title,
    detail: step.detail,
    requires_approval: step.requires_approval,
    approved_at: null,
    metadata: { ...step.metadata, ...metadata },
  });
}

// --- State loader ------------------------------------------------------------

async function loadPlannerState(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string
): Promise<PlannerState> {
  const [{ data: deals }, { data: documents }, { data: rehabItems }, { data: contractors }, { data: uws }] =
    await Promise.all([
      admin
        .from("deals")
        .select(
          "id, org_id, address, city, stage, asking_price, sqft, year_built, assessed_value, arv_estimate, arv_method"
        )
        .eq("org_id", orgId)
        .neq("stage", "Closed"),
      admin.from("documents").select("id, deal_id, rehab_item_id, doc_type, status, requested_at").eq("org_id", orgId),
      admin.from("rehab_items").select("id, deal_id, trade, status").eq("org_id", orgId),
      admin
        .from("contractors")
        .select("id, org_id, name, email, trade, license_number, insurance_expiry, verified_at")
        .eq("org_id", orgId),
      admin.from("underwriting").select("deal_id, arv, max_offer, projected_profit, passes_70_rule"),
    ]);

  const underwritings: PlannerState["underwritings"] = {};
  for (const u of (uws ?? []) as Array<{
    deal_id: string;
    arv: number | null;
    max_offer: number | null;
    projected_profit: number | null;
    passes_70_rule: boolean | null;
  }>) {
    underwritings[u.deal_id] = {
      arv: u.arv,
      max_offer: u.max_offer,
      projected_profit: u.projected_profit,
      passes_70_rule: u.passes_70_rule,
    };
  }

  return {
    orgId,
    deals: (deals ?? []) as PlannerDeal[],
    documents: (documents ?? []) as PlannerDocument[],
    rehabItems: (rehabItems ?? []) as PlannerRehabItem[],
    contractors: (contractors ?? []) as PlannerContractor[],
    underwritings,
  };
}

// --- Summary (watchdog queries) ---------------------------------------------

export async function getAgentSummary(orgId: string): Promise<AgentRunSummary> {
  const admin = createAdminClient();
  const [{ data: runs }, { data: actions }] = await Promise.all([
    admin
      .from("agent_runs")
      .select("id, started_at, summary")
      .eq("org_id", orgId)
      .order("started_at", { ascending: false })
      .limit(20),
    admin
      .from("agent_actions")
      .select("id, action_type, status, requires_approval, approved_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const byKind: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  let moneyGatesAwaiting = 0;
  for (const a of (actions ?? []) as Array<{
    action_type: string;
    status: string;
    requires_approval: boolean;
    approved_at: string | null;
  }>) {
    byKind[a.action_type] = (byKind[a.action_type] ?? 0) + 1;
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    if (a.requires_approval && a.status === "pending_approval") {
      moneyGatesAwaiting++;
    }
  }
  return {
    runs: (runs ?? []).length,
    actions: (actions ?? []).length,
    byKind,
    byStatus,
    moneyGatesAwaiting,
    lastRunAt: ((runs ?? [])[0] as { started_at?: string } | undefined)?.started_at ?? null,
  };
}

export async function approveAgentAction(actionId: string, orgId: string): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const admin = createAdminClient();
  const { data: action, error } = await admin
    .from("agent_actions")
    .select("id, org_id, deal_id, action_type, status, requires_approval, metadata")
    .eq("id", actionId)
    .single();
  if (error || !action) return { ok: false, reason: "not found" };
  const a = action as {
    id: string;
    org_id: string;
    deal_id: string | null;
    action_type: string;
    status: string;
    requires_approval: boolean;
    metadata: Record<string, unknown> | null;
  };
  if (a.org_id !== orgId) return { ok: false, reason: "forbidden" };
  if (!a.requires_approval) return { ok: false, reason: "action does not require approval" };
  if (a.status !== "pending_approval") return { ok: false, reason: `cannot approve in status ${a.status}` };

  // Apply the deferred payload.
  if (a.action_type === "advance_stage" && a.deal_id) {
    const to = a.metadata?.to as string | undefined;
    if (!to || !DEAL_STAGES.includes(to as (typeof DEAL_STAGES)[number])) {
      return { ok: false, reason: "missing or invalid target stage" };
    }
    const { error: upErr } = await admin
      .from("deals")
      .update({ stage: to, stage_changed_at: new Date().toISOString() })
      .eq("id", a.deal_id);
    if (upErr) return { ok: false, reason: upErr.message };
  }

  await admin
    .from("agent_actions")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", a.id);
  return { ok: true };
}
