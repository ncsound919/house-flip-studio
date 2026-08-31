# Phase 3 — Agent Automation Breadth + Guardrails Live Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Near-full autonomy within guardrails. The agent gains new action kinds (dossiers, comps, inspections, payments, list-price, exit prediction), auto-approves money actions within configured limits, and escalates everything else. Research/comps fetches move to an async job queue so the 30s cron budget isn't blown.

**Architecture:** Guardrail evaluation (Phase 1 skeleton) goes live in `executeStep`; new planner rules emit the new action kinds; a `agent_jobs` table + queue processor handles slow research work; the runner writes `auto_approved` status for guardrail-approved money actions; UI surfaces auto-vs-escalated telemetry.

**Tech Stack:** TypeScript, Next.js, Supabase, Zod, Vitest.

**Baseline:** Phases 1 + 2 committed (guardrails skeleton + real comps + orgSettings agent.limits).

---

## File Structure

- Modify: `src/lib/agent/types.ts` — new action kinds, `auto_approved` status.
- Modify: `src/lib/guardrails/evaluate.ts` — accept `metadata` payload (already does via ActionContext; extend with ctx fields).
- Modify: `src/lib/agent/planner.ts` — new per-stage rules.
- Modify: `src/lib/agent/runner.ts` — guardrails live, new handlers, job queue.
- Create: `src/lib/agent/queue.ts` — `enqueueJob`, `processJobs`, `agent_jobs` row types.
- Create: `supabase/migrations/009_agent_jobs.sql`.
- Modify: `src/app/api/cron/agent/route.ts` — process jobs before/after cycles.
- Modify: `src/app/(app)/settings/page.tsx` or FlipProfileForm — guardrail toggles UI.
- Modify: `src/components/agent/AgentPane.tsx`, `src/components/command/CommandCenter.tsx` — show `auto_approved` + blocked actions, guardrail evidence.
- Tests: `src/tests/guardrails.test.ts` (extend), `src/tests/agentPlanner.test.ts` (extend), `src/tests/agentQueue.test.ts`, `src/tests/agentAutonomy.test.ts` (extend).

---

### Task 1: New action kinds + auto_approved status

**Files:**
- Modify: `src/lib/agent/types.ts`

- [ ] **Step 1: Extend the union types**

```ts
export type AgentActionKind =
  | "hunt_leads"
  | "arv_estimate"
  | "underwrite"
  | "advance_stage"
  | "generate_scope"
  | "generate_document"
  | "chase_document"
  | "draft_rfq"
  | "verify_contractor"
  | "fetch_dossier" // research dossier for hot/warm lead (non-money)
  | "fetch_comps" // real comps for a deal (non-money)
  | "schedule_inspection" // propose/auto-schedule inspection
  | "record_payment" // rehab spend draw (non-money ledger entry)
  | "approve_payment" // MONEY GATE — draw approval
  | "recommend_list_price" // comps-based list price recommendation (non-money)
  | "predict_exit" // timeline + proceeds vs carrying costs (non-money)
  | "send_rfq" // MONEY GATE — requires approval
  | "send_offer" // MONEY GATE — requires approval
  | "start_rehab" // MONEY GATE — requires approval
  | "info";

export type AgentActionStatus =
  | "done"
  | "skipped"
  | "blocked"
  | "failed"
  | "pending_approval"
  | "approved"
  | "auto_approved"; // guardrail-authorized within limits
```

- [ ] **Step 2: Run typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no consumers yet break on the new union members).

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/types.ts
git commit -m "feat(agent): action kinds + auto_approved status for guardrail autonomy"
```

### Task 2: Guardrail evaluation goes live in the runner

**Files:**
- Modify: `src/lib/agent/runner.ts`
- Test: `src/tests/guardrails.test.ts` + `src/tests/agentAutonomy.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/tests/agentAutonomy.test.ts`, add (follow the file's existing runner-call mocking pattern):

```ts
describe("runner — guardrails live", () => {
  it("auto-approves a money action within limits and records auto_approved", async () => {
    // Arrange: org settings with autoSendOffers enabled, max 50k; a deal in
    // Underwriting passing 70% rule; runAgentCycle with executeMoneyActions false.
    // Assert: agent_actions has status "auto_approved" for the advance_stage,
    // and the deal advanced to Offer Made.
  });

  it("escalates a money action over the limit to pending_approval", async () => {
    // Arrange: same but maxOfferAmount below the proposed offer.
    // Assert: status "pending_approval", deal NOT advanced.
  });
});
```

Follow the existing `agentAutonomy.test.ts` patterns exactly (check how it mocks `createAdminClient` / the admin client used by the runner — it likely builds a fake admin with an in-memory store).

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/agentAutonomy.test.ts`
Expected: FAIL — guardrail evaluation not applied (still always escalates).

- [ ] **Step 3: Implement**

In `executeStep`, replace the Phase 1 pass-through with the live logic:

```ts
if (step.requires_approval) {
  const evaluation = evaluateAction(
    { kind: step.kind, requiresApproval: true },
    policy.settings.agent.limits,
    {
      amount: Number(step.metadata.amount) || undefined,
      offersToday: policy.ctx?.offersToday,
      spendThisMonth: policy.ctx?.spendThisMonth,
    }
  );
  if (evaluation.decision === "auto_approve") {
    if (!policy.executeMoneyActions) {
      // Guardrail authorizes it — execute now, then record auto_approved.
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
```

Add `policy.ctx` to `RunOptions`/`executeStep` policy (optional counters injected for daily/monthly caps) and a `executeMoneyAction` that routes money kinds to the same underlying mutators (`applyAdvanceStage`, `applySendRfq`, `applyApprovePayment`, `applyStartRehab`).

Important: money mutators must be identical to the approval path (`approveAgentAction`) so a guardrail-auto-approve and a manual approve produce the same world-state. Reuse `applyAdvanceStage` for `advance_stage` money targets.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tests/agentAutonomy.test.ts` → PASS.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run` → all green (guardrail defaults are all-disabled, so existing "pending_approval" behavior is preserved).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/runner.ts src/tests/agentAutonomy.test.ts src/tests/guardrails.test.ts
git commit -m "feat(agent): live guardrail evaluation auto-approves within limits"
```

### Task 3: Job queue (agent_jobs)

**Files:**
- Create: `supabase/migrations/009_agent_jobs.sql`
- Create: `src/lib/agent/queue.ts`
- Test: `src/tests/agentQueue.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 3: async agent jobs for slow research work (dossiers, comps).
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  kind text not null,          -- 'fetch_dossier' | 'fetch_comps' | 'predict_exit'
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending', -- 'pending' | 'running' | 'done' | 'failed'
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists agent_jobs_pending_idx
  on public.agent_jobs (org_id, status, created_at);
```

- [ ] **Step 2: Write the queue lib**

`src/lib/agent/queue.ts`:

```ts
import { createAdminClient } from "@/lib/apiHelpers";

export type AgentJobKind = "fetch_dossier" | "fetch_comps" | "predict_exit";
export type AgentJobStatus = "pending" | "running" | "done" | "failed";

export interface AgentJob {
  id: string;
  org_id: string;
  deal_id: string | null;
  kind: AgentJobKind;
  payload: Record<string, unknown>;
  status: AgentJobStatus;
  attempts: number;
  error: string | null;
  created_at: string;
}

export async function enqueueJob(
  orgId: string,
  kind: AgentJobKind,
  dealId: string | null,
  payload: Record<string, unknown> = {}
): Promise<{ ok: boolean; reason?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from("agent_jobs").insert({
    org_id: orgId,
    deal_id: dealId,
    kind,
    payload,
    status: "pending",
    attempts: 0,
  });
  return error ? { ok: false, reason: error.message } : { ok: true };
}

// Dedup: don't queue the same kind for the same deal twice.
export async function hasPendingJob(
  orgId: string,
  kind: AgentJobKind,
  dealId: string | null
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("agent_jobs")
    .select("id")
    .eq("org_id", orgId)
    .eq("kind", kind)
    .eq("deal_id", dealId ?? "")
    .in("status", ["pending", "running"]);
  return (data ?? []).length > 0;
}
```

- [ ] **Step 3: Write the failing test**

`src/tests/agentQueue.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { hasPendingJob } from "../lib/agent/queue";

describe("agent queue", () => {
  it("dedupes pending jobs of same kind+deal", async () => {
    // Mock createAdminClient's from() chain to return one pending row.
    // Assert hasPendingJob(...) is true.
  });
});
```

Follow the codebase's mocking pattern for the admin client (see `agentAutonomy.test.ts`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/tests/agentQueue.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/009_agent_jobs.sql src/lib/agent/queue.ts src/tests/agentQueue.test.ts
git commit -m "feat(agent): async job queue for research work"
```

### Task 4: Planner emits new action kinds

**Files:**
- Modify: `src/lib/agent/planner.ts`
- Test: `src/tests/agentPlanner.test.ts` (extend)

- [ ] **Step 1: Write the failing tests**

```ts
describe("planAgentActions — Phase 3 kinds", () => {
  it("emits fetch_dossier for hot/warm leads in Lead/Inspecting", () => {
    const plan = planAgentActions(
      state({
        deals: [
          deal({ id: "d-hot", stage: "Lead", assessed_value: 90_000 }),
          deal({ id: "d-other", stage: "Lead", assessed_value: 30_000 }),
        ],
      })
    );
    const fd = plan.filter((p) => p.kind === "fetch_dossier");
    // Lead tier isn't in planner state; we emit for all non-closed Lead deals
    // and let the runner/settings decide. Assert at least one fetch_dossier.
    expect(fd.length).toBeGreaterThan(0);
  });

  it("emits schedule_inspection for Inspecting deals within caps", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Inspecting" })] }));
    const si = plan.find((p) => p.kind === "schedule_inspection");
    expect(si).toBeDefined();
    expect(si!.requires_approval).toBe(false);
  });

  it("emits recommend_list_price when rehab complete and deal in Rehab", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab", arv_estimate: 250_000 })],
        rehabItems: [{ id: "r1", deal_id: "d1", trade: "Roofing", status: "completed" }],
      })
    );
    const rl = plan.find((p) => p.kind === "recommend_list_price");
    expect(rl).toBeDefined();
    expect(rl!.requires_approval).toBe(false);
  });

  it("emits predict_exit for Rehab/Listed deals", () => {
    const plan = planAgentActions(state({ deals: [deal({ stage: "Rehab" })] }));
    const pe = plan.find((p) => p.kind === "predict_exit");
    expect(pe).toBeDefined();
    expect(pe!.requires_approval).toBe(false);
  });

  it("emits record_payment for Rehab deals with contracted items", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ stage: "Rehab" })],
        rehabItems: [{ id: "r1", deal_id: "d1", trade: "Roofing", status: "contracted" }],
      })
    );
    const rp = plan.find((p) => p.kind === "record_payment");
    expect(rp).toBeDefined();
    expect(rp!.requires_approval).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/agentPlanner.test.ts`
Expected: FAIL — new kinds not emitted.

- [ ] **Step 3: Implement the planner rules**

Add per-stage emissions:

- `planForLead`/`planForInspecting`: emit `fetch_dossier` for deals without an existing dossier flag in state (add `dossiers` to `PlannerState` — a `Set<string>` of dealIds, loaded in `loadPlannerState` from the `dossiers` table).
- `planForInspecting`: emit `schedule_inspection` (non-money; guardrail decides auto-schedule vs propose).
- `planForRehab`: 
  - emit `record_payment` for each contracted item without a payment (add `payments` to `PlannerState`: map dealId → list of { rehab_item_id, status }). Payment records come from a new `payments` table (created in Phase 4's migration — for Phase 3, create the table in migration 009).
  - emit `approve_payment` (MONEY GATE) when a recorded payment exists and is unapproved.
  - emit `recommend_list_price` when all items completed (before/with the Listed advance).
  - emit `predict_exit` for Rehab and Listed deals.

Add `payments` table to migration 009:

```sql
-- Phase 3: rehab payment/draw ledger.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  rehab_item_id uuid references public.rehab_items (id) on delete cascade,
  amount numeric not null,
  status text not null default 'recorded', -- 'recorded' | 'approved' | 'paid'
  description text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists payments_deal_idx on public.payments (deal_id, created_at);
```

Update `loadPlannerState` to load dossiers + payments into the state.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tests/agentPlanner.test.ts` → PASS.

- [ ] **Step 5: Run full suite**

Run: `npx vitest run` → green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agent/planner.ts src/lib/agent/types.ts supabase/migrations/009_agent_jobs.sql src/tests/agentPlanner.test.ts
git commit -m "feat(agent): planner emits dossier/inspection/payment/list-price/exit actions"
```

### Task 5: Runner handlers for new kinds

**Files:**
- Modify: `src/lib/agent/runner.ts`
- Test: `src/tests/agentAutonomy.test.ts` (extend)

- [ ] **Step 1: Wire the switch cases**

In `executeStep`, add:

```ts
case "fetch_dossier":
  return await applyFetchDossier(admin, runId, orgId, step);
case "schedule_inspection":
  return await applyScheduleInspection(admin, runId, orgId, step);
case "record_payment":
  return await applyRecordPayment(admin, runId, orgId, step);
case "approve_payment":
  return await applyApprovePayment(admin, runId, orgId, step);
case "recommend_list_price":
  return await applyRecommendListPrice(admin, runId, orgId, step);
case "predict_exit":
  return await applyPredictExit(admin, runId, orgId, step);
```

- [ ] **Step 2: Implement handlers**

`applyFetchDossier`: enqueue a `fetch_dossier` job (via `enqueueJob`) and record the action as `done` with `queued: true`. The job processor (Task 6) runs `compileDossier` and upserts `dossiers` + `research_sources`.

`applyScheduleInspection`: determine the deal's target inspection window (e.g., next 7 days). If guardrail `autoScheduleInspections.enabled` and cap allows → record `done` with proposed window + `auto: true`; else record `done` with `auto: false` and `requiresOperator: true` (an `info`-style note). Non-money either way — but recording a real inspection only happens via the operator (no fake scheduled inspection).

`applyRecordPayment`: insert a `payments` row (status `recorded`) for the contracted rehab item, with `amount` from the item's `estimated_cost` (or actual_cost if set). Non-money.

`applyApprovePayment`: MONEY GATE. Mark the payment `approved` only when guardrail `autoSpendRehab` authorizes it (via `executeMoneyAction`) or the operator approves through the existing approval flow. When escalated, record `pending_approval`.

`applyRecommendListPrice`: compute a deterministic list price = `max(arv_estimate, comps median × 1.02)` from real comps on file; record `done` with the recommendation + source label. Non-money; listing itself stays gated.

`applyPredictExit`: deterministic timeline (current stage dwell + remaining stages) + projected proceeds = `arv_estimate − totalProjectCost`; record `done` with `timelineDays`, `projectedProceeds`, labeled projected. Non-money.

- [ ] **Step 3: Add tests for each handler in agentAutonomy.test.ts** following existing patterns (mock admin client; assert the world-state mutation + action status).

Run: `npx vitest run src/tests/agentAutonomy.test.ts` → PASS.

- [ ] **Step 4: Run full suite**

Run: `npx vitest run` → green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/runner.ts src/tests/agentAutonomy.test.ts
git commit -m "feat(agent): runner handlers for dossier/inspection/payment/list-price/exit"
```

### Task 6: Job processor in the cron

**Files:**
- Modify: `src/lib/agent/queue.ts` (add `processJobs`)
- Modify: `src/app/api/cron/agent/route.ts`

- [ ] **Step 1: Implement processJobs**

Add to `queue.ts`:

```ts
import { compileDossier } from "@/lib/research/dossier";

export async function processJobs(orgId: string, limit = 5): Promise<{ processed: number; errors: string[] }> {
  const admin = createAdminClient();
  const { data: jobs } = await admin
    .from("agent_jobs")
    .select("*")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  const errors: string[] = [];
  let processed = 0;
  for (const job of (jobs ?? []) as AgentJob[]) {
    await admin.from("agent_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", job.id);
    try {
      if (job.kind === "fetch_dossier") {
        const settings = await getOrgSettings(orgId);
        const profile = settings.flipProfile;
        const dossier = await compileDossier({
          dealId: job.deal_id ?? "",
          address: String(job.payload.address ?? ""),
          pin: job.payload.pin ? String(job.payload.pin) : undefined,
          profile: { minAssessed: profile.minAssessed, maxAssessed: profile.maxAssessed },
        });
        await admin.from("dossiers").upsert({
          org_id: orgId,
          deal_id: job.deal_id,
          sources: dossier.sources,
          compiled_at: dossier.compiledAt,
        }, { onConflict: "deal_id" });
      }
      await admin.from("agent_jobs").update({ status: "done", finished_at: new Date().toISOString() }).eq("id", job.id);
      processed++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "job failed";
      errors.push(msg);
      await admin
        .from("agent_jobs")
        .update({ status: "failed", error: msg, finished_at: new Date().toISOString() })
        .eq("id", job.id);
    }
  }
  return { processed, errors };
}
```

- [ ] **Step 2: Call processJobs in the cron**

In `src/app/api/cron/agent/route.ts`, after each org's `runAgentCycle`, call `await processJobs(org.id)` and include `jobsProcessed`/`jobErrors` in the result.

- [ ] **Step 3: Add a test**

`src/tests/agentQueue.test.ts`: mock admin store; seed one `fetch_dossier` job; assert `processJobs` marks it `done` and upserts a dossier row. Follow existing mock pattern.

Run: `npx vitest run src/tests/agentQueue.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/queue.ts src/app/api/cron/agent/route.ts src/tests/agentQueue.test.ts
git commit -m "feat(agent): cron processes async research job queue"
```

### Task 7: Settings UI for guardrail toggles

**Files:**
- Modify: `src/components/settings/FlipProfileForm.tsx`
- Modify: `src/app/(app)/settings/page.tsx`

- [ ] **Step 1: Add guardrail toggle section**

Extend `FlipProfileForm` (it already PATCHes `/api/settings`) with an "Autonomy guardrails" section. For each of `autoSendOffers`, `autoSendRfq`, `autoSpendRehab`, `autoChase`, `autoScheduleInspections` render an enabled checkbox + numeric cap fields. On save, PATCH `{ agent: { limits: {...} } }`. Mirror the existing form's styling and save behavior exactly.

Add honest labeling: "Guardrails default to OFF. The agent auto-approves money actions ONLY within these limits and escalates everything else. Every auto-approval is logged with the rule and evidence."

- [ ] **Step 2: Verify the API accepts the shape**

The `saveOrgSettings` deepMerge already handles `agent.limits` (Phase 1 Task 3). Run typecheck.

Run: `npx tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/FlipProfileForm.tsx src/app/(app)/settings/page.tsx
git commit -m "feat(ui): autonomy guardrail toggles in settings"
```

### Task 8: Agent pane + command center telemetry

**Files:**
- Modify: `src/components/agent/AgentPane.tsx`
- Modify: `src/components/command/CommandCenter.tsx`
- Modify: `src/lib/agent/types.ts` (AgentRunSummary — add autoApproved count)

- [ ] **Step 1: Extend AgentRunSummary**

Add to `AgentRunSummary`:

```ts
autoApproved?: number; // money actions guardrail-authorized
blockedCount?: number; // money actions blocked by limits
```

Populate in `getAgentSummary`: count `auto_approved` and `blocked` statuses.

- [ ] **Step 2: Surface in UI**

- `AgentPane`: render `auto_approved` actions with a distinct badge (e.g., "AUTO-APPROVED (limit: rule)") and `blocked` actions with "BLOCKED BY LIMIT" + the reason. For `pending_approval`, keep existing approve flow.
- `CommandCenter` "Business pulse": add `autoApproved` and `blockedCount` to the agent summary line, so the operator can see autonomy working.

Follow existing component patterns (read AgentPane.tsx and CommandCenter.tsx before editing).

- [ ] **Step 3: Typecheck + tests**

Run: `npx tsc --noEmit` → PASS. Run: `npx vitest run` → green.

- [ ] **Step 4: Commit**

```bash
git add src/components/agent/AgentPane.tsx src/components/command/CommandCenter.tsx src/lib/agent/types.ts
git commit -m "feat(ui): surface auto-approved + blocked guardrail telemetry"
```

---

## Self-review notes

- Guardrails default OFF → existing behavior unchanged until the operator opts in.
- Every auto-approval is logged with rule + evidence (HONESTY).
- Money mutators shared between guardrail-auto-approve and manual approval paths, so world-state is identical.
- Research (dossiers, comps) runs in the async job queue; the cron processes it separately from the 30s cycle.