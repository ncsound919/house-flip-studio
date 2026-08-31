import { createAdminClient } from "@/lib/apiHelpers";
import { calculateUnderwriting } from "@/lib/underwriting";
import { huntLeads } from "@/lib/leadHunt";
import { DEAL_STAGES } from "@/lib/types";
import { sendEmail } from "./email";
import { getOrgSettings, underwritingFor, type OrgSettings } from "@/lib/orgSettings";
import { verifyContractor } from "@/lib/contractorVerification";
import { buildDeterministicRfq } from "@/lib/rfqBuilder";
import { generateScopeForDeal } from "@/lib/agent/scope";
import { evaluateAction } from "@/lib/guardrails/evaluate";
import { fetchDeedComps } from "@/lib/research/sources/deeds";
import { enqueueJob, hasPendingJob } from "./queue";
import {
  planAgentActions,
  type PlannedAction,
  type PlannerState,
  type PlannerDeal,
  type PlannerDocument,
  type PlannerRehabItem,
  type PlannerContractor,
  type PlannerRfqDraft,
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

// Optional counters the guardrail engine uses for daily/monthly caps. Injected
// by the caller (cron/manual) so the operator can bound autonomy per window.
export interface AgentGuardrailCounters {
  offersToday?: number;
  rfqsToday?: number;
  spendThisMonth?: number;
  chasesToday?: number;
  inspectionsToday?: number;
}

interface RunOptions {
  orgId: string;
  trigger: AgentRunTrigger;
  // Optional override: if true, also execute money-gated actions
  // (used only for tests). In production this is always false.
  executeMoneyActions?: boolean;
  ctx?: AgentGuardrailCounters;
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

  // Mutual exclusion: never run two cycles for the same org concurrently
  // (manual "Run now" can overlap the scheduled cron). A run still marked
  // "running" older than 30 minutes is treated as a crashed cycle and taken over.
  const { data: recent } = await admin
    .from("agent_runs")
    .select("id, status, started_at")
    .eq("org_id", opts.orgId)
    .order("started_at", { ascending: false })
    .limit(1);
  const lastRunRow = (recent ?? [])[0] as { id: string; status: string; started_at: string } | undefined;
  if (
    lastRunRow?.status === "running" &&
    lastRunRow.started_at &&
    Date.now() - new Date(lastRunRow.started_at).getTime() < 30 * 60_000
  ) {
    const skipped = await admin
      .from("agent_runs")
      .insert({ org_id: opts.orgId, trigger: opts.trigger, status: "skipped", summary: { skipped: "another cycle in progress", inProgressRunId: lastRunRow.id } })
      .select("id")
      .single();
    const skippedId = (skipped.data as { id?: string } | null)?.id ?? "";
    return {
      runId: skippedId,
      actions: 0,
      moneyGatesAwaiting: 0,
      errors: ["skipped: agent cycle already in progress"],
    };
  }

  // Insert with status "running" so a crashed/killed run is never falsely shown
  // as completed. Finalized to completed/partial/failed at the end.
  const { data: run, error: runErr } = await admin
    .from("agent_runs")
    .insert({ org_id: opts.orgId, trigger: opts.trigger, status: "running" as AgentRunStatus })
    .select("id")
    .single();
  if (runErr || !run) {
    throw new Error(`Failed to create agent_run: ${runErr?.message ?? "unknown"}`);
  }
  const runId = run.id as string;

  let moneyGatesAwaiting = 0;
  let actionCount = 0;

  // Operator settings gate what the cycle is allowed to do.
  const settings = await getOrgSettings(opts.orgId);

  try {
    // 0) Global kill-switch: agent.enabled=false disables the whole cycle, not
    //    just the hunt. Honest audit trail so the run is documented, not skipped.
    if (!settings.agent.enabled) {
      await recordAction(
        admin,
        runId,
        opts.orgId,
        {
          kind: "info",
          title: "Agent cycle disabled by settings",
          detail: "agent.enabled is false — no hunt, planning, or actions taken this run.",
          requires_approval: false,
          metadata: { reason: "agent_disabled" },
        },
        "skipped",
        {}
      );
      actionCount++;
      const summary = {
        actions: actionCount,
        moneyGatesAwaiting: 0,
        errors: 0,
        finishedAt: new Date().toISOString(),
      };
      await admin
        .from("agent_runs")
        .update({
          status: "completed" as AgentRunStatus,
          summary,
          finished_at: new Date().toISOString(),
        })
        .eq("id", runId);
      return { runId, actions: actionCount, moneyGatesAwaiting: 0, errors };
    }

    // 1) Lead hunt first — the agent is self-feeding (honors the org's flip
    //    profile: statewide vs county list).
    const fp = settings.flipProfile;
    if (settings.agent.huntOnCycle && (fp.statewide || fp.counties.length > 0)) {
      try {
        const hunt = await huntLeads({
          orgId: opts.orgId,
          statewide: fp.statewide,
          counties: fp.counties,
          maxTotal: settings.agent.maxHuntPerCycle,
          settings,
        });
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
    }

    // 2) Plan + execute across all deals.
    const state = await loadPlannerState(admin, opts.orgId);
    const plan = planAgentActions(state);

    for (const step of plan) {
      try {
        const { status, reason } = await executeStep(admin, opts.orgId, runId, step, {
          executeMoneyActions: !!opts.executeMoneyActions,
          settings,
          ctx: opts.ctx,
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

export async function executeStep(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  runId: string,
  step: PlannedAction,
  policy: { executeMoneyActions: boolean; settings: OrgSettings; ctx?: AgentGuardrailCounters }
): Promise<{ status: AgentActionStatus; reason?: string }> {
  // Money gate: the guardrail engine (Phase 1 skeleton, now live) decides.
  // Defaults are all-disabled, so today's behavior (escalate to operator) is
  // preserved until the operator opts into near-full autonomy per rule.
  if (step.requires_approval) {
    const evaluation = evaluateAction(
      { kind: step.kind, requiresApproval: true, toStage: (step.metadata.to as string | undefined) ?? undefined },
      policy.settings.agent.limits,
      {
        amount: moneyAmountFor(step),
        offersToday: policy.ctx?.offersToday,
        rfqsToday: policy.ctx?.rfqsToday,
        spendThisMonth: policy.ctx?.spendThisMonth,
        chasesToday: policy.ctx?.chasesToday,
        inspectionsToday: policy.ctx?.inspectionsToday,
      }
    );
    if (evaluation.decision === "auto_approve") {
      if (!policy.executeMoneyActions) {
        // Guardrail authorizes it — execute now, then record auto_approved with
        // the rule + evidence that justified the autonomy.
        const result = await executeMoneyAction(admin, runId, orgId, step);
        await recordAction(admin, runId, orgId, step, "auto_approved", {
          guardrailRule: evaluation.rule,
          guardrailEvidence: evaluation.evidence,
          ...(result.reason ? { error: result.reason } : {}),
        });
        return { status: "auto_approved", reason: result.reason };
      }
      // Fall through to normal execution (explicit authorization path).
    } else if (evaluation.decision === "block") {
      await recordAction(admin, runId, orgId, step, "blocked", {
        guardrailReason: evaluation.reason,
      });
      return { status: "blocked", reason: evaluation.reason };
    } else {
      await recordAction(admin, runId, orgId, step, "pending_approval", {
        awaiting: "operator",
        guardrailDecision: evaluation.decision,
      });
      return { status: "pending_approval" };
    }
  }

  switch (step.kind) {
    case "arv_estimate":
      return await applyArvEstimate(admin, runId, orgId, step);
    case "underwrite":
      return await applyUnderwrite(admin, runId, orgId, step, policy.settings);
    case "advance_stage":
      return await applyAdvanceStage(admin, runId, orgId, step);
    case "generate_document":
      return await applyGenerateDocument(admin, runId, orgId, step);
    case "chase_document":
      return await applyChaseDocument(admin, runId, orgId, step);
    case "verify_contractor":
      return await applyVerifyContractor(admin, runId, orgId, step);
    case "generate_scope":
      return await applyGenerateScope(admin, runId, orgId, step, policy.settings);
    case "draft_rfq":
      return await applyDraftRfq(admin, runId, orgId, step);
    case "fetch_dossier":
      return await applyFetchDossier(admin, runId, orgId, step);
    case "fetch_comps":
      return await applyFetchComps(admin, runId, orgId, step);
    case "schedule_inspection":
      return await applyScheduleInspection(admin, runId, orgId, step, policy.settings.agent.limits);
    case "record_payment":
      return await applyRecordPayment(admin, runId, orgId, step);
    case "approve_payment":
      return await applyApprovePayment(admin, runId, orgId, step);
    case "recommend_list_price":
      return await applyRecommendListPrice(admin, runId, orgId, step);
    case "predict_exit":
      return await applyPredictExit(admin, runId, orgId, step);
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
  step: PlannedAction,
  settings: OrgSettings
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const arv = step.metadata.arv as number | undefined;
  const asking = step.metadata.asking_price as number | undefined;
  if (arv == null || asking == null) {
    return { status: "skipped", reason: "missing arv or asking" };
  }
  const uw = underwritingFor(settings);
  // Heuristic rehab estimate: settings.rehabPerSqft or a safe % of ARV when sqft unknown.
  const { data: deal } = await admin
    .from("deals")
    .select("sqft")
    .eq("id", step.dealId)
    .single();
  const sqft = Number((deal as { sqft?: number } | null)?.sqft) || 0;
  const rehab = sqft > 0 ? sqft * uw.rehabPerSqft : Math.round(arv * 0.18);
  const calc = calculateUnderwriting({
    arv,
    rehabEstimate: rehab,
    purchasePrice: asking,
    holdingMonths: uw.holdingMonths,
    downPaymentPct: uw.downPaymentPct,
    interestRate: uw.interestRate,
    loanPoints: uw.loanPoints,
  });
  const row = {
    deal_id: step.dealId,
    arv,
    rehab_estimate: rehab,
    purchase_price: asking,
    max_offer: calc.maxOffer,
    final_purchase_price: calc.finalPurchasePrice,
    passes_70_rule: calc.passes70Rule,
    acquisition_costs: calc.acquisitionCosts,
    holding_costs: calc.holdingCosts,
    selling_costs: calc.sellingCosts,
    financing_costs: calc.financingCosts,
    total_project_cost: calc.totalProjectCost,
    projected_profit: calc.projectedProfit,
    roi: calc.roi,
    cash_on_cash: calc.cashOnCash,
    down_payment_amount: calc.downPaymentAmount,
    loan_amount: calc.loanAmount,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("underwriting")
    .upsert(row, { onConflict: "deal_id" });
  if (error) return { status: "failed", reason: error.message };
  await recordAction(admin, runId, orgId, step, "done", { calc });
  return { status: "done" };
}

async function applyAdvanceStage(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  const result = await mutateAdvanceStage(admin, step);
  if (result.status !== "done") return result;
  await recordAction(admin, runId, orgId, step, "done", { to: step.metadata.to });
  return result;
}

// Core stage mutation shared by the manual-approval path (approveAgentAction
// re-derives it) and the guardrail auto-approve path, so both produce the same
// world-state. Never records an action — callers own the audit log entry.
async function mutateAdvanceStage(
  admin: ReturnType<typeof createAdminClient>,
  step: PlannedAction
): Promise<{ status: AgentActionStatus; reason?: string; to?: string }> {
  const to = step.metadata.to as string | undefined;
  if (!to || !DEAL_STAGES.includes(to as (typeof DEAL_STAGES)[number])) {
    return { status: "skipped", reason: `unknown target stage: ${to}` };
  }
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  // Re-validate against the live stage: the plan is a snapshot, and a deal the
  // operator moved or closed mid-run must not be overwritten or regressed.
  const { data: live } = await admin
    .from("deals")
    .select("stage")
    .eq("id", step.dealId)
    .single();
  const currentStage = (live as { stage?: string } | null)?.stage;
  if (currentStage) {
    const fromIdx = DEAL_STAGES.indexOf(currentStage as (typeof DEAL_STAGES)[number]);
    const toIdx = DEAL_STAGES.indexOf(to as (typeof DEAL_STAGES)[number]);
    // Covers already-at-target (idempotent no-op) and regressions (e.g. a deal
    // the operator moved to Rehab must not be pulled back to Under Contract).
    if (fromIdx >= toIdx) {
      return { status: "skipped", reason: `deal already at/after ${to} (current ${currentStage})` };
    }
  }
  const { error } = await admin
    .from("deals")
    .update({ stage: to, stage_changed_at: new Date().toISOString() })
    .eq("id", step.dealId);
  if (error) return { status: "failed", reason: error.message };
  return { status: "done", to };
}

// Amount the guardrail should evaluate for a money step. advance_stage carries
// the offer in its underwriting snapshot (uw.max_offer) rather than a flat
// amount, so we read it from there.
function moneyAmountFor(step: PlannedAction): number | undefined {
  if (step.metadata.amount != null) return Number(step.metadata.amount);
  if (step.kind === "advance_stage") {
    const uw = step.metadata.uw as { max_offer?: unknown } | undefined;
    if (uw && uw.max_offer != null) return Number(uw.max_offer);
  }
  return undefined;
}

// Guardrail-authorized money execution. Routes to the same core mutators the
// manual approval path uses so world-state is identical either way. The audit
// log entry is written by the caller (auto_approved) or the wrapper (done).
async function executeMoneyAction(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): Promise<{ status: AgentActionStatus; reason?: string }> {
  switch (step.kind) {
    case "advance_stage":
      return await mutateAdvanceStage(admin, step);
    case "approve_payment":
      return await mutateApprovePayment(admin, step);
    case "send_rfq":
    case "send_offer":
    case "start_rehab":
      return { status: "skipped", reason: "no live money mutator for this kind in this phase" };
    default:
      return { status: "skipped", reason: "not a money action" };
  }
}

// Core draw-approval mutator shared by the guardrail auto-approve path and the
// operator approval path (approveAgentAction). Never records — callers own the
// audit log entry.
async function mutateApprovePayment(
  admin: ReturnType<typeof createAdminClient>,
  step: PlannedAction
): Promise<{ status: AgentActionStatus; reason?: string }> {
  const paymentId = step.metadata.payment_id as string | undefined;
  if (!paymentId) return { status: "skipped", reason: "no payment_id" };
  const { error } = await admin
    .from("payments")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", paymentId);
  if (error) return { status: "failed", reason: error.message };
  return { status: "done" };
}

// Explicit-authorization handler (falls through only when the caller passed
// executeMoneyActions): same world-state as the guardrail path.
async function applyApprovePayment(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  const result = await mutateApprovePayment(admin, step);
  if (result.status !== "done") return result;
  await recordAction(admin, runId, orgId, step, "done", { approved: true });
  return result;
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
  const result = await verifyContractor(admin, orgId, step.contractorId);
  await recordAction(admin, runId, orgId, step, result.verified ? "done" : "failed", {
    verified: result.verified,
    detail: result.detail,
    licenseTier: result.licenseTier,
    checkedAt: result.checkedAt,
  });
  return result.verified
    ? { status: "done" }
    : { status: "failed", reason: result.detail ?? "license not verified" };
}

async function applyDraftRfq(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.dealId || !step.contractorId) {
    return { status: "skipped", reason: "no dealId or contractorId" };
  }

  const [{ data: deal }, { data: contractor }, { data: items }] = await Promise.all([
    admin.from("deals").select("id, org_id, address, city, state, zip").eq("id", step.dealId).single(),
    admin.from("contractors").select("id, org_id, name, trade").eq("id", step.contractorId).single(),
    admin
      .from("rehab_items")
      .select("id, deal_id, org_id, trade, description, estimated_cost")
      .eq("deal_id", step.dealId)
      .eq("org_id", orgId),
  ]);

  if (!deal || !contractor) return { status: "skipped", reason: "deal or contractor missing" };
  if (deal.org_id !== orgId || contractor.org_id !== orgId) {
    return { status: "skipped", reason: "org mismatch" };
  }
  const itemsOrg = (items ?? []).filter((r: { org_id: string }) => r.org_id === orgId);

  const addressParts = [deal.address, [deal.city, deal.state].filter(Boolean).join(", "), deal.zip].filter(Boolean);
  const addressLine = addressParts.join(" ").replace(/\s+/g, " ").trim() || deal.address;

  const { data: existing } = await admin
    .from("rfq_drafts")
    .select("id")
    .eq("deal_id", step.dealId)
    .eq("contractor_id", step.contractorId)
    .limit(1);
  if (existing && existing.length > 0) {
    await recordAction(admin, runId, orgId, step, "skipped", { reason: "rfq draft already exists" });
    return { status: "skipped", reason: "rfq draft already exists" };
  }

  const draft_text = buildDeterministicRfq({
    contractorName: contractor.name,
    contractorTrade: contractor.trade ?? "contractor",
    address: addressLine,
    scopeLines: itemsOrg.map((r: { trade: string | null; description: string; estimated_cost: number }) => ({
      trade: r.trade,
      description: r.description,
      estimatedCost: Number(r.estimated_cost) || 0,
    })),
  });

  const { error } = await admin.from("rfq_drafts").insert({
    org_id: orgId,
    deal_id: step.dealId,
    contractor_id: step.contractorId,
    rehab_item_ids: itemsOrg.map((r: { id: string }) => r.id),
    draft_text,
    status: "draft",
  });
  if (error) return { status: "failed", reason: error.message };

  await recordAction(admin, runId, orgId, step, "done", {
    address: addressLine,
    scopeItemCount: itemsOrg.length,
  });
  return { status: "done" };
}

async function applyGenerateScope(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction,
  settings: OrgSettings
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const { data: deal } = await admin
    .from("deals")
    .select("id, org_id, address, city, sqft, year_built")
    .eq("id", step.dealId)
    .single();
  if (!deal || deal.org_id !== orgId) return { status: "skipped", reason: "deal missing or org mismatch" };
  const scope = await generateScopeForDeal(deal, settings);
  // Insert all-or-nothing: if any line fails midway, roll back the ones already
  // inserted so the deal is never left with a partial scope (which would stop
  // the planner from regenerating it).
  const insertedIds: string[] = [];
  for (const line of scope.lines) {
    const { data, error } = await admin
      .from("rehab_items")
      .insert({
        org_id: orgId,
        deal_id: step.dealId,
        trade: line.trade,
        description: line.description,
        estimated_cost: line.estimated_cost,
        status: "estimated",
      })
      .select("id");
    if (error) {
      if (insertedIds.length > 0) {
        await admin.from("rehab_items").delete().in("id", insertedIds);
      }
      return { status: "failed", reason: error.message };
    }
    const row = (data ?? [])[0] as { id?: string } | undefined;
    if (row?.id) insertedIds.push(row.id);
  }
  await recordAction(admin, runId, orgId, step, "done", {
    source: scope.source,
    items: scope.lines.length,
    notes: scope.notes,
  });
  return { status: "done" };
}

async function applyFetchDossier(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  // Dedup against the queue: never stack a second dossier job for the same deal.
  if (await hasPendingJob(orgId, "fetch_dossier", step.dealId)) {
    await recordAction(admin, runId, orgId, step, "skipped", { reason: "dossier job already pending" });
    return { status: "skipped", reason: "dossier job already pending" };
  }
  const queued = await enqueueJob(orgId, "fetch_dossier", step.dealId, {
    address: String(step.metadata.address ?? ""),
    pin: step.metadata.pin ? String(step.metadata.pin) : undefined,
  });
  if (!queued.ok) {
    await recordAction(admin, runId, orgId, step, "failed", { error: queued.reason });
    return { status: "failed", reason: queued.reason };
  }
  await recordAction(admin, runId, orgId, step, "done", { queued: true, jobKind: "fetch_dossier" });
  return { status: "done" };
}

async function applyFetchComps(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const { data: deal } = await admin
    .from("deals")
    .select("id, org_id, address")
    .eq("id", step.dealId)
    .single();
  if (!deal || deal.org_id !== orgId) return { status: "skipped", reason: "deal missing or org mismatch" };
  const address = (deal as { address: string }).address;
  const r = await fetchDeedComps(address);
  if (r.status !== "ok" || !r.data || r.data.length === 0) {
    await recordAction(admin, runId, orgId, step, "failed", {
      error: r.error ?? "no comps returned",
      source: "deeds",
    });
    return { status: "failed", reason: r.error ?? "no comps returned" };
  }
  const rows = r.data.slice(0, 10).map((c) => ({
    deal_id: step.dealId,
    sale_price: c.sale_price,
    sale_date: c.sale_date ?? null,
    source: c.source,
    distance_score: c.distance_score ?? null,
  }));
  const { error } = await admin.from("comps").insert(rows);
  if (error) {
    await recordAction(admin, runId, orgId, step, "failed", { error: error.message });
    return { status: "failed", reason: error.message };
  }
  await recordAction(admin, runId, orgId, step, "done", {
    source: "deeds",
    inserted: rows.length,
  });
  return { status: "done" };
}

async function applyScheduleInspection(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction,
  limits: OrgSettings["agent"]["limits"]
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const windowDays = Number(step.metadata.windowDays) || 7;
  const l = limits.autoScheduleInspections;
  const auto = l.enabled && l.maxPerDay > 0;
  // HONESTY: nothing is actually scheduled here — a real inspection only happens
  // via the operator. This records the proposal + whether guardrails would have
  // auto-scheduled it. No fabricated appointments.
  await recordAction(admin, runId, orgId, step, "done", {
    proposedFrom: new Date().toISOString().slice(0, 10),
    proposedTo: new Date(Date.now() + windowDays * 86_400_000).toISOString().slice(0, 10),
    auto,
    requiresOperator: !auto,
  });
  return { status: "done" };
}

async function applyRecordPayment(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const itemId = step.metadata.rehab_item_id as string | undefined;
  if (!itemId) return { status: "skipped", reason: "no rehab_item_id" };
  const { data: item } = await admin
    .from("rehab_items")
    .select("estimated_cost, actual_cost")
    .eq("id", itemId)
    .single();
  const itemRow = item as { estimated_cost?: number | null; actual_cost?: number | null } | null;
  const amount = Number(itemRow?.actual_cost) || Number(itemRow?.estimated_cost) || 0;
  const { error } = await admin.from("payments").insert({
    org_id: orgId,
    deal_id: step.dealId,
    rehab_item_id: itemId,
    amount,
    status: "recorded",
  });
  if (error) return { status: "failed", reason: error.message };
  await recordAction(admin, runId, orgId, step, "done", { rehab_item_id: itemId, amount });
  return { status: "done" };
}

async function applyRecommendListPrice(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const [{ data: deal }, { data: comps }] = await Promise.all([
    admin.from("deals").select("arv_estimate").eq("id", step.dealId).single(),
    admin.from("comps").select("sale_price").eq("deal_id", step.dealId),
  ]);
  const arv = Number((deal as { arv_estimate?: number | null } | null)?.arv_estimate) || 0;
  const prices = ((comps ?? []) as Array<{ sale_price?: number | null }>)
    .map((c) => Number(c.sale_price))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b);
  let listPrice: number;
  let source: string;
  if (prices.length > 0) {
    const median = prices[Math.floor(prices.length / 2)];
    listPrice = Math.max(arv, Math.round(median * 1.02));
    source = `max(arv, comps median ${median.toLocaleString("en-US")} × 1.02)`;
  } else {
    listPrice = arv;
    source = "arv (no comps on file)";
  }
  await recordAction(admin, runId, orgId, step, "done", { listPrice, source });
  return { status: "done" };
}

async function applyPredictExit(
  admin: ReturnType<typeof createAdminClient>,
  runId: string,
  orgId: string,
  step: PlannedAction
): ExecResult {
  if (!step.dealId) return { status: "skipped", reason: "no dealId" };
  const [{ data: deal }, { data: uwRows }] = await Promise.all([
    admin.from("deals").select("stage, stage_changed_at, arv_estimate").eq("id", step.dealId).single(),
    admin.from("underwriting").select("total_project_cost, arv").eq("deal_id", step.dealId).limit(1),
  ]);
  const dealRow = deal as { stage?: string; stage_changed_at?: string; arv_estimate?: number | null } | null;
  const uwRow = ((uwRows ?? []) as Array<{ total_project_cost?: number | null; arv?: number | null }>)[0];
  const arv =
    Number(dealRow?.arv_estimate) || Number(uwRow?.arv) || 0;
  const totalProjectCost = Number(uwRow?.total_project_cost) || 0;
  const stageIdx = dealRow?.stage ? DEAL_STAGES.indexOf(dealRow.stage as (typeof DEAL_STAGES)[number]) : -1;
  const remainingStages = stageIdx >= 0 ? Math.max(0, DEAL_STAGES.length - 1 - stageIdx) : 0;
  const dwell = dealRow?.stage_changed_at
    ? Math.max(0, Math.floor((Date.now() - new Date(dealRow.stage_changed_at).getTime()) / 86_400_000))
    : 0;
  const timelineDays = dwell + remainingStages * 30;
  const projectedProceeds = arv - totalProjectCost;
  await recordAction(admin, runId, orgId, step, "done", {
    timelineDays,
    projectedProceeds,
    remainingStages,
    projected: true,
  });
  return { status: "done" };
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
  const deals = await admin
    .from("deals")
    .select(
      "id, org_id, address, city, stage, asking_price, sqft, year_built, assessed_value, arv_estimate, arv_method"
    )
    .eq("org_id", orgId)
    .neq("stage", "Closed");
  const dealIds = ((deals.data ?? []) as Array<{ id: string }>).map((d) => d.id);

  const [{ data: documents }, { data: rehabItems }, { data: contractors }, { data: uws }, { data: rfqDrafts }, { data: comps }, { data: pendingGates }, { data: recentChases }, { data: dossiers }, { data: paymentRows }] =
    await Promise.all([
      admin.from("documents").select("id, deal_id, rehab_item_id, doc_type, status, requested_at").eq("org_id", orgId),
      admin.from("rehab_items").select("id, deal_id, trade, status").eq("org_id", orgId),
      admin
        .from("contractors")
        .select("id, org_id, name, email, trade, license_number, insurance_expiry, verified_at, license_checked_at")
        .eq("org_id", orgId),
      // underwriting and comps have no org_id — scope by the org's own deal ids
      // so we never pull cross-tenant rows into the planner snapshot.
      dealIds.length > 0
        ? admin.from("underwriting").select("deal_id, arv, max_offer, projected_profit, passes_70_rule").in("deal_id", dealIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from("rfq_drafts").select("id, deal_id, contractor_id").eq("org_id", orgId),
      dealIds.length > 0
        ? admin.from("comps").select("deal_id, sale_price").in("deal_id", dealIds)
        : Promise.resolve({ data: [], error: null }),
      admin
        .from("agent_actions")
        .select("deal_id, action_type, metadata")
        .eq("org_id", orgId)
        .eq("requires_approval", true)
        .eq("status", "pending_approval"),
      admin
        .from("agent_actions")
        .select("contractor_id, created_at")
        .eq("org_id", orgId)
        .eq("action_type", "chase_document")
        .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()),
      admin.from("dossiers").select("deal_id").eq("org_id", orgId),
      admin.from("payments").select("id, deal_id, rehab_item_id, amount, status").eq("org_id", orgId),
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

  const compsByDeal: PlannerState["comps"] = {};
  for (const c of (comps ?? []) as Array<{ deal_id: string; sale_price: number | null }>) {
    if (!compsByDeal[c.deal_id]) compsByDeal[c.deal_id] = [];
    compsByDeal[c.deal_id].push({ sale_price: c.sale_price });
  }

  const pendingGatesList: PlannerState["pendingGates"] = ((pendingGates ?? []) as Array<{
    deal_id: string | null;
    action_type: string;
    metadata?: Record<string, unknown> | null;
  }>)
    .filter((g) => g.deal_id != null)
    .map((g) => ({
      dealId: g.deal_id as string,
      kind: g.action_type,
      to: (g.metadata?.to as string | undefined) ?? undefined,
    }));

  const recentChasesList: PlannerState["recentChases"] = ((recentChases ?? []) as Array<{
    contractor_id: string | null;
    created_at: string;
  }>).map((c) => ({ contractorId: c.contractor_id, at: c.created_at }));

  const dossiersSet: PlannerState["dossiers"] = new Set(
    ((dossiers ?? []) as Array<{ deal_id: string | null }>)
      .map((d) => d.deal_id)
      .filter((id): id is string => id != null)
  );

  const paymentsByDeal: PlannerState["payments"] = {};
  for (const p of (paymentRows ?? []) as Array<{
    id: string;
    deal_id: string;
    rehab_item_id: string | null;
    amount: number | null;
    status: string;
  }>) {
    if (!paymentsByDeal[p.deal_id]) paymentsByDeal[p.deal_id] = [];
    paymentsByDeal[p.deal_id].push({
      id: p.id,
      rehab_item_id: p.rehab_item_id ?? "",
      status: p.status,
      amount: p.amount,
    });
  }

  return {
    orgId,
    deals: (deals.data ?? []) as PlannerDeal[],
    documents: (documents ?? []) as PlannerDocument[],
    rehabItems: (rehabItems ?? []) as PlannerRehabItem[],
    contractors: (contractors ?? []) as PlannerContractor[],
    rfqDrafts: (rfqDrafts ?? []) as PlannerRfqDraft[],
    pendingGates: pendingGatesList,
    recentChases: recentChasesList,
    comps: compsByDeal,
    underwritings,
    dossiers: dossiersSet,
    payments: paymentsByDeal,
  };
}

// --- Summary (watchdog queries) ---------------------------------------------

export async function getAgentSummary(orgId: string): Promise<AgentRunSummary> {
  const admin = createAdminClient();
  const [{ data: runs }, { data: actions }] = await Promise.all([
    admin
      .from("agent_runs")
      .select("id, started_at, status, summary")
      .eq("org_id", orgId)
      .order("started_at", { ascending: false })
      .limit(20),
    admin
      .from("agent_actions")
      .select("id, action_type, status, requires_approval, approved_at, metadata, detail")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const byKind: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byKindStatus: Record<string, Record<string, number>> = {};
  const errorCounts: Record<string, number> = {};
  let moneyGatesAwaiting = 0;
  let autoApproved = 0;
  let blockedCount = 0;
  for (const a of (actions ?? []) as Array<{
    action_type: string;
    status: string;
    requires_approval: boolean;
    approved_at: string | null;
    metadata?: Record<string, unknown> | null;
    detail?: string | null;
  }>) {
    byKind[a.action_type] = (byKind[a.action_type] ?? 0) + 1;
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    byKindStatus[a.action_type] = byKindStatus[a.action_type] ?? {};
    byKindStatus[a.action_type][a.status] = (byKindStatus[a.action_type][a.status] ?? 0) + 1;
    if (a.requires_approval && a.status === "pending_approval") {
      moneyGatesAwaiting++;
    }
    if (a.status === "auto_approved") autoApproved++;
    if (a.status === "blocked") blockedCount++;
    if (a.status === "failed" || a.status === "blocked") {
      const msg =
        (a.metadata?.error as string) ?? (a.detail && a.detail !== "none" ? a.detail : null);
      if (msg) {
        const key = msg.slice(0, 120);
        errorCounts[key] = (errorCounts[key] ?? 0) + 1;
      }
    }
  }
  const topErrors = Object.entries(errorCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));

  const lastRun = (runs ?? [])[0] as { started_at?: string; status?: string } | undefined;
  return {
    runs: (runs ?? []).length,
    actions: (actions ?? []).length,
    byKind,
    byStatus,
    byKindStatus,
    topErrors,
    moneyGatesAwaiting,
    autoApproved,
    blockedCount,
    lastRunAt: lastRun?.started_at ?? null,
    lastRunStatus: lastRun?.status ?? null,
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
    // Stale-approval guard: the operator may have moved the deal since this
    // action was queued. Approving an old gate must never regress the deal.
    const { data: live } = await admin.from("deals").select("stage").eq("id", a.deal_id).single();
    const currentStage = (live as { stage?: string } | null)?.stage;
    if (currentStage) {
      const fromIdx = DEAL_STAGES.indexOf(currentStage as (typeof DEAL_STAGES)[number]);
      const toIdx = DEAL_STAGES.indexOf(to as (typeof DEAL_STAGES)[number]);
      if (fromIdx > toIdx) {
        return { ok: false, reason: `stale — deal is already at ${currentStage}` };
      }
    }
    const { error: upErr } = await admin
      .from("deals")
      .update({ stage: to, stage_changed_at: new Date().toISOString() })
      .eq("id", a.deal_id);
    if (upErr) return { ok: false, reason: upErr.message };
  }

  if (a.action_type === "approve_payment") {
    const paymentId = a.metadata?.payment_id as string | undefined;
    if (!paymentId) return { ok: false, reason: "missing payment_id" };
    const { error: payErr } = await admin
      .from("payments")
      .update({ status: "approved", approved_at: new Date().toISOString() })
      .eq("id", paymentId);
    if (payErr) return { ok: false, reason: payErr.message };
  }

  await admin
    .from("agent_actions")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", a.id);
  return { ok: true };
}
