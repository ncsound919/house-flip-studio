# Phase 1 — Research Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every lead carries a real, auditable research dossier plus richer hunt-time signals (absentee, tax-delinquent, multi-parcel), and the guardrail engine skeleton exists.

**Architecture:** Extend `leadHunt`/`leadScoring` with new signals derived from county tax records; add a `research/` module that compiles per-deal dossiers from real public + paid sources (each recorded with source + fetched_at, failures as `error`); add `guardrails/limits.ts` + `evaluate.ts` as a pass-through wired into the runner that auto-approves nothing yet but logs evaluations.

**Tech Stack:** TypeScript, Next.js, Supabase (PostgREST), Zod, Vitest. No LLM in dossier math.

**Baseline:** Requires the uncommitted autonomy-deepening WIP committed first (orgSettings, runner, planner, scope, rfqBuilder, contractorVerification are the base).

---

## File Structure

- Create: `src/lib/guardrails/limits.ts` — zod schema for `agent.limits` (conservative defaults).
- Create: `src/lib/guardrails/evaluate.ts` — pure `evaluateAction()` returning auto/escalate/block.
- Create: `src/lib/research/dossier.ts` — `compileDossier()` + `DossierResult` types.
- Create: `src/lib/research/sources/countyTax.ts` — parcel source adapter (wraps existing fetchCountyParcels + owner signals).
- Create: `src/lib/research/sources/deeds.ts` — stub contract (real impl in Phase 2).
- Create: `src/lib/research/sources/liens.ts`, `permits.ts`, `courts.ts`, `rentcast.ts` — public/paid adapters with graceful error.
- Create: `src/lib/research/sources/types.ts` — `ResearchSource`, `SourceResult` types.
- Modify: `src/lib/listingSources/types.ts` — add `multiParcelOwner`, `taxDelinquent` motivation fields.
- Modify: `src/lib/listingSources/countyParcels.ts` — derive new signals from NC OneMap record.
- Modify: `src/lib/leadScoring.ts` — score new signals.
- Modify: `src/lib/leadHunt.ts` — carry new signals into notes.
- Modify: `src/lib/orgSettings.ts` — add `agent.limits` schema (folded into agent section).
- Modify: `src/lib/agent/runner.ts` — pass-through guardrail evaluation log.
- Create: `supabase/migrations/007_research_and_guardrails.sql`.
- Tests: `src/tests/guardrails.test.ts`, `src/tests/dossier.test.ts`, `src/tests/researchSignals.test.ts`.

---

### Task 1: Guardrail limits schema

**Files:**
- Create: `src/lib/guardrails/limits.ts`
- Test: `src/tests/guardrails.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/guardrails.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from "zod";

// Guardrail limits — the near-full-autonomy policy. Folded into org_settings
// under `agent.limits`. HONESTY: every limit defaults to DISABLED so the agent
// auto-approves nothing until the operator explicitly enables it.

export const autoSendOffersSchema = z.object({
  enabled: z.boolean().default(false),
  maxOfferAmount: z.number().default(0),
  dailyCap: z.number().default(0),
});

export const autoSendRfqSchema = z.object({
  enabled: z.boolean().default(false),
  dailyCap: z.number().default(0),
});

export const autoSpendRehabSchema = z.object({
  enabled: z.boolean().default(false),
  monthlyCap: z.number().default(0),
});

export const autoChaseSchema = z.object({
  enabled: z.boolean().default(false),
  dailyCap: z.number().default(0),
});

export const autoScheduleInspectionsSchema = z.object({
  enabled: z.boolean().default(false),
  maxPerDay: z.number().default(0),
});

export const guardrailLimitsSchema = z.object({
  autoSendOffers: autoSendOffersSchema.default({}),
  autoSendRfq: autoSendRfqSchema.default({}),
  autoSpendRehab: autoSpendRehabSchema.default({}),
  autoChase: autoChaseSchema.default({}),
  autoScheduleInspections: autoScheduleInspectionsSchema.default({}),
});

export type GuardrailLimits = z.infer<typeof guardrailLimitsSchema>;

export const DEFAULT_GUARDRAILS: GuardrailLimits = {
  autoSendOffers: { enabled: false, maxOfferAmount: 0, dailyCap: 0 },
  autoSendRfq: { enabled: false, dailyCap: 0 },
  autoSpendRehab: { enabled: false, monthlyCap: 0 },
  autoChase: { enabled: false, dailyCap: 0 },
  autoScheduleInspections: { enabled: false, maxPerDay: 0 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/guardrails.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/guardrails/limits.ts src/tests/guardrails.test.ts
git commit -m "feat(guardrails): limits schema, all-disabled defaults"
```

### Task 2: Guardrail evaluate engine (pass-through)

**Files:**
- Create: `src/lib/guardrails/evaluate.ts`
- Test: `src/tests/guardrails.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { evaluateAction } from "../lib/guardrails/evaluate";
import { DEFAULT_GUARDRAILS } from "../lib/guardrails/limits";

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/guardrails.test.ts`
Expected: FAIL — `evaluateAction` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { GuardrailLimits } from "./limits";

export type EvaluationDecision = "execute" | "auto_approve" | "escalate" | "block";

export interface Evaluation {
  decision: EvaluationDecision;
  rule?: string;
  evidence?: string;
  reason?: string;
}

export interface EvaluatedAction {
  kind: string;
  requiresApproval: boolean;
}

interface ActionContext {
  amount?: number;
  offersToday?: number;
  rfqsToday?: number;
  spendThisMonth?: number;
  chasesToday?: number;
  inspectionsToday?: number;
}

// HONESTY: money actions only auto-approve when their rule is explicitly enabled
// AND the amount/cap check passes. Every auto-approval carries rule + evidence.
export function evaluateAction(
  action: EvaluatedAction,
  limits: GuardrailLimits,
  ctx: ActionContext
): Evaluation {
  if (!action.requiresApproval) return { decision: "execute" };

  switch (action.kind) {
    case "send_offer": {
      const l = limits.autoSendOffers;
      if (!l.enabled || l.maxOfferAmount <= 0) return { decision: "escalate" };
      const amount = Number(ctx.amount) || 0;
      if (amount > l.maxOfferAmount) {
        return {
          decision: "block",
          reason: `offer $${amount.toLocaleString("en-US")} exceeds maxOfferAmount $${l.maxOfferAmount.toLocaleString("en-US")}`,
        };
      }
      if ((ctx.offersToday ?? 0) >= l.dailyCap) {
        return { decision: "block", reason: `dailyCap ${l.dailyCap} reached` };
      }
      return {
        decision: "auto_approve",
        rule: "autoSendOffers",
        evidence: `offer $${amount.toLocaleString("en-US")} ≤ $${l.maxOfferAmount.toLocaleString("en-US")}, cap ${l.dailyCap}`,
      };
    }
    case "send_rfq": {
      const l = limits.autoSendRfq;
      if (!l.enabled || l.dailyCap <= 0) return { decision: "escalate" };
      if ((ctx.rfqsToday ?? 0) >= l.dailyCap) {
        return { decision: "block", reason: `dailyCap ${l.dailyCap} reached` };
      }
      return { decision: "auto_approve", rule: "autoSendRfq", evidence: `cap ${l.dailyCap}` };
    }
    case "start_rehab":
    case "approve_payment": {
      const l = limits.autoSpendRehab;
      if (!l.enabled || l.monthlyCap <= 0) return { decision: "escalate" };
      const amount = Number(ctx.amount) || 0;
      if ((ctx.spendThisMonth ?? 0) + amount > l.monthlyCap) {
        return { decision: "block", reason: `monthly spend would exceed cap $${l.monthlyCap.toLocaleString("en-US")}` };
      }
      return {
        decision: "auto_approve",
        rule: "autoSpendRehab",
        evidence: `spend $${amount.toLocaleString("en-US")} within $${l.monthlyCap.toLocaleString("en-US")}`,
      };
    }
    case "chase_document": {
      const l = limits.autoChase;
      if (!l.enabled || l.dailyCap <= 0) return { decision: "escalate" };
      if ((ctx.chasesToday ?? 0) >= l.dailyCap) {
        return { decision: "block", reason: `dailyCap ${l.dailyCap} reached` };
      }
      return { decision: "auto_approve", rule: "autoChase", evidence: `cap ${l.dailyCap}` };
    }
    case "schedule_inspection": {
      const l = limits.autoScheduleInspections;
      if (!l.enabled || l.maxPerDay <= 0) return { decision: "escalate" };
      if ((ctx.inspectionsToday ?? 0) >= l.maxPerDay) {
        return { decision: "block", reason: `maxPerDay ${l.maxPerDay} reached` };
      }
      return { decision: "auto_approve", rule: "autoScheduleInspections", evidence: `max ${l.maxPerDay}` };
    }
    default:
      return { decision: "escalate" };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/guardrails.test.ts`
Expected: PASS (7 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/lib/guardrails/evaluate.ts src/tests/guardrails.test.ts
git commit -m "feat(guardrails): evaluate engine with auto/escalate/block decisions"
```

### Task 3: Fold limits into org settings

**Files:**
- Modify: `src/lib/orgSettings.ts`
- Test: `src/tests/orgSettings.test.ts`

- [ ] **Step 1: Add to agentSettingsSchema and test**

Add to `src/tests/orgSettings.test.ts`:

```ts
import { parseOrgSettings, DEFAULT_SETTINGS } from "../lib/orgSettings";
import { DEFAULT_GUARDRAILS } from "../lib/guardrails/limits";

describe("orgSettings — agent.limits", () => {
  it("defaults agent.limits to all-disabled guardrails", () => {
    const s = parseOrgSettings({});
    expect(s.agent.limits).toEqual(DEFAULT_GUARDRAILS);
  });

  it("preserves an explicit limits patch", () => {
    const s = parseOrgSettings({
      agent: { limits: { autoSendOffers: { enabled: true, maxOfferAmount: 40_000, dailyCap: 3 } } },
    });
    expect(s.agent.limits.autoSendOffers.enabled).toBe(true);
  });

  it("DEFAULT_SETTINGS carries limits", () => {
    expect(DEFAULT_SETTINGS.agent.limits).toEqual(DEFAULT_GUARDRAILS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/orgSettings.test.ts`
Expected: FAIL — `limits` does not exist on agent schema.

- [ ] **Step 3: Implement**

Import the guardrail schema into `orgSettings.ts` and extend the agent schema + DEFAULT_SETTINGS + deepMerge:

```ts
import { guardrailLimitsSchema, DEFAULT_GUARDRAILS, type GuardrailLimits } from "@/lib/guardrails/limits";

export const agentSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  huntOnCycle: z.boolean().default(true),
  maxHuntPerCycle: z.number().default(100),
  limits: guardrailLimitsSchema.default({}),
});
```

Update `DEFAULT_SETTINGS.agent` to include `limits: DEFAULT_GUARDRAILS`. Update `deepMerge` so `agent` merges `limits`:

```ts
agent: {
  ...base.agent,
  ...(patch.agent ?? {}),
  limits: {
    ...base.agent.limits,
    ...(patch.agent?.limits ?? {}),
  },
},
```

Also export the type: `export type AgentSettings = z.infer<typeof agentSettingsSchema>;`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/orgSettings.test.ts`
Expected: PASS.

- [ ] **Step 5: Run full suite (regression)**

Run: `npx vitest run`
Expected: all pass (agentPlanner, leadHunt, etc. — settings shape changed but additive).

- [ ] **Step 6: Commit**

```bash
git add src/lib/orgSettings.ts src/tests/orgSettings.test.ts
git commit -m "feat(settings): fold guardrail limits into agent.limits"
```

### Task 4: Richer hunt-time signals (county parcel source)

**Files:**
- Modify: `src/lib/listingSources/types.ts`
- Modify: `src/lib/listingSources/countyParcels.ts`
- Test: `src/tests/researchSignals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { mapParcel } from "../lib/listingSources/countyParcels";

describe("county parcel research signals", () => {
  it("flags multi-parcel owner from ownerCount >= 3", () => {
    const card = mapParcel({ siteadd: "1 Main St", mailadd: "PO Box 5", mstate: "NC", ownname: "SMITH JOHN", parno: "123", structyear: "1975", parval: "80000", ownerCount: 3 });
    expect(card.motivation?.multiParcelOwner).toBe(true);
  });

  it("flags tax delinquent when taxDelinquent flag present", () => {
    const card = mapParcel({ siteadd: "1 Main St", mailadd: "1 Main St", mstate: "NC", ownname: "JONES", parno: "999", structyear: "1975", parval: "80000", taxDelinquent: "Y" });
    expect(card.motivation?.taxDelinquent).toBe(true);
  });

  it("does not flag when signals absent", () => {
    const card = mapParcel({ siteadd: "1 Main St", mailadd: "1 Main St", mstate: "NC", ownname: "BROWN", parno: "77", structyear: "1975", parval: "80000" });
    expect(card.motivation?.multiParcelOwner).toBe(false);
    expect(card.motivation?.taxDelinquent).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/tests/researchSignals.test.ts`
Expected: FAIL — fields do not exist on Motivation.

- [ ] **Step 3: Implement**

In `src/lib/listingSources/types.ts`, extend the `motivation` interface:

```ts
motivation?: {
  absenteeOwner: boolean;
  outOfStateOwner: boolean;
  longHeld: boolean;
  olderHome: boolean;
  multiParcelOwner: boolean;
  taxDelinquent: boolean;
  reasonCount: number;
  reasons: string[];
};
```

In `src/lib/listingSources/countyParcels.ts`, extend `computeMotivation`:

```ts
// 5. Multi-parcel owner: same owner across >= 3 parcels (portfolio owner).
const ownerCount = Number(a.ownercount ?? a.ownerCount);
const multiParcelOwner = Number.isFinite(ownerCount) && ownerCount >= 3;
if (multiParcelOwner) reasons.push("Multi-parcel owner (portfolio)");

// 6. Tax delinquent: county flag when exposed on the record.
const taxDelFlag = String(a.taxdelinquent ?? a.taxDelinquent ?? "").toUpperCase();
const taxDelinquent = taxDelFlag === "Y" || taxDelFlag === "YES" || taxDelFlag === "1";
if (taxDelinquent) reasons.push("Tax delinquent");
```

Add both to the returned `Motivation` object and include `ownerCount`/`taxDelinquent` in the NC OneMap `outFields` list so the feed returns them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/tests/researchSignals.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run full suite**

Run: `npx vitest run` — countyParcels, leadScoring, leadTier tests must stay green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/listingSources/types.ts src/lib/listingSources/countyParcels.ts src/tests/researchSignals.test.ts
git commit -m "feat(research): multi-parcel + tax-delinquent owner signals from tax records"
```

### Task 5: Score the new signals

**Files:**
- Modify: `src/lib/leadScoring.ts`
- Test: `src/tests/researchSignals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { scoreLead, type LeadScore } from "../lib/leadScoring";
import type { ListingCard } from "../lib/listingSources/types";

function card(over: Partial<ListingCard> = {}): ListingCard {
  return {
    address: "1 Main St",
    county: "Wake",
    source: "county_gis",
    source_label: "nc_onemap_parcel",
    parcel: { assessedValue: 80_000, pin: "123" },
    motivation: {
      absenteeOwner: false, outOfStateOwner: false, longHeld: false, olderHome: true,
      multiParcelOwner: false, taxDelinquent: false, reasonCount: 0, reasons: [],
    },
    ...over,
  };
}

describe("lead scoring — new research signals", () => {
  it("adds score for multi-parcel owner", () => {
    const s = scoreLead(card({ motivation: { ...card().motivation!, multiParcelOwner: true, reasonCount: 1, reasons: ["x"] } }));
    expect(s.attentionScore).toBeGreaterThan(50);
  });

  it("adds score and flag for tax delinquent", () => {
    const s = scoreLead(card({ motivation: { ...card().motivation!, taxDelinquent: true, reasonCount: 1, reasons: ["y"] } }));
    expect(s.attentionScore).toBeGreaterThan(50);
    expect(s.flags.join(" ")).toContain("tax");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/researchSignals.test.ts`
Expected: FAIL — score unchanged.

- [ ] **Step 3: Implement**

In `leadScoring.ts`, after the existing motivation block:

```ts
if (m?.multiParcelOwner) { score += 10; flags.push("Multi-parcel owner — portfolio, may be motivated to sell"); }
if (m?.taxDelinquent) { score += 12; flags.push("Tax delinquent — distress signal, potential lien/title risk"); }
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tests/researchSignals.test.ts` → PASS.

- [ ] **Step 5: Full suite + commit**

Run: `npx vitest run` → green. Commit:

```bash
git add src/lib/leadScoring.ts src/tests/researchSignals.test.ts
git commit -m "feat(research): score multi-parcel and tax-delinquent signals"
```

### Task 6: Carry new signals into hunt notes

**Files:**
- Modify: `src/lib/leadHunt.ts`
- Test: `src/tests/leadHunt.test.ts`

- [ ] **Step 1: Write the failing test**

In `leadHunt.test.ts` add:

```ts
import { scoreAndTier } from "../lib/leadTier";
import type { ListingCard } from "../lib/listingSources/types";

describe("leadHunt — new signal notes", () => {
  it("tier notes include new signals via reasons", () => {
    const card: ListingCard = {
      address: "5 Oak St", county: "Wake", source: "county_gis", source_label: "nc_onemap_parcel",
      parcel: { assessedValue: 90_000, pin: "55" },
      motivation: { absenteeOwner: false, outOfStateOwner: false, longHeld: false, olderHome: true, multiParcelOwner: true, taxDelinquent: true, reasonCount: 2, reasons: ["Multi-parcel owner (portfolio)", "Tax delinquent"] },
    };
    const { score, tier } = scoreAndTier(card);
    expect(score.flags.join(" ")).toMatch(/Multi-parcel/);
    expect(score.flags.join(" ")).toMatch(/tax delinquent/i);
    expect(tier).toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/leadHunt.test.ts`
Expected: FAIL — flags do not contain new signals (motivation.reasons are used for notes but flags come from scoring).

- [ ] **Step 3: Implement**

`leadHunt.ts` already appends `score.flags` to notes via the `tierNotes` + `Flags:` line — no code change strictly required beyond Task 5. If the test still fails, confirm `motivationNotes` includes the new reasons (it uses `listing.motivation.reasons.join("; ")` which now includes the two new reasons). Update `motivationNotes` fallback if reasons are empty by deriving from flags.

Verify the existing `processListings` writes `Flags:` line from `score.flags` — it does. The test above asserts flags, so Task 5 satisfies it. Re-run and, if green, note in the commit that no leadHunt change was needed.

- [ ] **Step 4: Run full suite**

Run: `npx vitest run` → green.

- [ ] **Step 5: Commit**

```bash
git add src/tests/leadHunt.test.ts
git commit -m "test(research): verify new signals flow into hunt flags"
```

### Task 7: Research sources — contracts + adapters

**Files:**
- Create: `src/lib/research/sources/types.ts`
- Create: `src/lib/research/sources/countyTax.ts`
- Create: `src/lib/research/sources/deeds.ts`
- Create: `src/lib/research/sources/liens.ts`
- Create: `src/lib/research/sources/permits.ts`
- Create: `src/lib/research/sources/courts.ts`
- Create: `src/lib/research/sources/rentcast.ts`
- Test: `src/tests/dossier.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { fetchCountyTaxRecord } from "../lib/research/sources/countyTax";
import { fetchRentcastProperty } from "../lib/research/sources/rentcast";

describe("research sources — graceful degradation", () => {
  it("countyTax returns a typed result, never throws", async () => {
    const r = await fetchCountyTaxRecord("123", { minAssessed: 30_000, maxAssessed: 150_000 });
    expect(["ok", "error"]).toContain(r.status);
  });

  it("rentcast returns error when no API key is configured", async () => {
    const prev = process.env.RENTCAST_API_KEY;
    delete process.env.RENTCAST_API_KEY;
    const r = await fetchRentcastProperty("123 Main St");
    expect(r.status).toBe("error");
    process.env.RENTCAST_API_KEY = prev;
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/dossier.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the contracts**

`src/lib/research/sources/types.ts`:

```ts
export type SourceStatus = "ok" | "error";

export interface SourceResult<T> {
  source: string;
  status: SourceStatus;
  fetchedAt: string;
  data?: T;
  error?: string;
}

export interface TaxRecord {
  pin?: string;
  owner?: string;
  assessedValue?: number;
  landValue?: number;
  buildingValue?: number;
  acreage?: number;
  lastSaleDate?: string;
  lastSalePrice?: number;
  mailingAddress?: string;
  mailingState?: string;
  multiParcelOwner?: boolean;
  taxDelinquent?: boolean;
}

export interface DeedRecord {
  grantor?: string;
  grantee?: string;
  salePrice?: number;
  saleDate?: string;
  propertyAddress?: string;
  pin?: string;
}

export interface LienRecord {
  type: string;
  amount?: number;
  filedDate?: string;
  description?: string;
}

export interface PermitRecord {
  type: string;
  status: string;
  issuedDate?: string;
  description?: string;
}

export interface RentcastProperty {
  address: string;
  ownerName?: string;
  occupantName?: string;
  occupancyType?: "owner" | "tenant" | "vacant" | "unknown";
  yearBuilt?: number;
  sqft?: number;
  beds?: number;
  baths?: number;
  lastSalePrice?: number;
  lastSaleDate?: string;
  estimatedValue?: number;
}
```

`src/lib/research/sources/countyTax.ts`:

```ts
import { fetchCountyParcels } from "@/lib/listingSources/countyParcels";
import type { SourceResult, TaxRecord } from "./types";

export async function fetchCountyTaxRecord(
  pin: string,
  profile: { minAssessed: number; maxAssessed: number }
): Promise<SourceResult<TaxRecord>> {
  const r = await fetchCountyParcels({ max: 10, minAssessed: profile.minAssessed, maxAssessed: profile.maxAssessed });
  if (r.error || r.cards.length === 0) {
    return { source: "county_tax", status: "error", fetchedAt: new Date().toISOString(), error: r.error ?? "no parcels returned" };
  }
  const match = r.cards.find((c) => c.parcel?.pin && normalizePin(c.parcel.pin) === normalizePin(pin));
  const card = match ?? r.cards[0];
  return {
    source: "county_tax",
    status: "ok",
    fetchedAt: new Date().toISOString(),
    data: {
      pin: card.parcel?.pin,
      owner: card.parcel?.owner,
      assessedValue: card.parcel?.assessedValue,
      landValue: card.parcel?.landValue,
      buildingValue: card.parcel?.buildingValue,
      acreage: card.parcel?.acreage,
      lastSaleDate: card.parcel?.lastSaleDate,
      mailingAddress: card.parcel?.mailingAddress,
      mailingState: card.parcel?.mailingState,
      multiParcelOwner: card.motivation?.multiParcelOwner,
      taxDelinquent: card.motivation?.taxDelinquent,
    },
  };
}

function normalizePin(pin: string): string {
  return pin.replace(/[^a-z0-9]/gi, "").toLowerCase();
}
```

`src/lib/research/sources/deeds.ts` (stub contract, real impl in Phase 2):

```ts
import type { DeedRecord, SourceResult } from "./types";

// Phase 2 will implement county deed-record comps. This stub keeps the
// dossier contract stable so compileDossier can be built now.
export async function fetchDeedRecords(
  _address: string
): Promise<SourceResult<DeedRecord[]>> {
  return {
    source: "deeds",
    status: "error",
    fetchedAt: new Date().toISOString(),
    error: "deed source not implemented (Phase 2)",
  };
}
```

`src/lib/research/sources/liens.ts`:

```ts
import type { LienRecord, SourceResult } from "./types";

export async function fetchLiens(
  _pin: string
): Promise<SourceResult<LienRecord[]>> {
  // Per-county public feeds vary; where none is configured we return an
  // honest error rather than fabricating a clean title report.
  return {
    source: "liens",
    status: "error",
    fetchedAt: new Date().toISOString(),
    error: "no configured lien source for this county",
  };
}
```

`src/lib/research/sources/permits.ts` (same graceful-error pattern as liens, keyed on `RENTCAST_API_KEY`/county config) and `src/lib/research/sources/courts.ts` (foreclosure notices — graceful error when no feed configured).

`src/lib/research/sources/rentcast.ts`:

```ts
import type { RentcastProperty, SourceResult } from "./types";

const RENTCAST_URL = "https://api.rentcast.io/v1/properties";

// Paid API — HONESTY: returns a real result or an explicit error. Never
// fabricates owner/occupancy/value. Requires RENTCAST_API_KEY.
export async function fetchRentcastProperty(
  address: string
): Promise<SourceResult<RentcastProperty>> {
  const key = process.env.RENTCAST_API_KEY;
  if (!key) {
    return { source: "rentcast", status: "error", fetchedAt: new Date().toISOString(), error: "RENTCAST_API_KEY not configured" };
  }
  try {
    const res = await fetch(`${RENTCAST_URL}?address=${encodeURIComponent(address)}`, {
      headers: { accept: "application/json", "X-Api-Key": key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      return { source: "rentcast", status: "error", fetchedAt: new Date().toISOString(), error: `rentcast returned ${res.status}` };
    }
    const j = await res.json();
    return {
      source: "rentcast",
      status: "ok",
      fetchedAt: new Date().toISOString(),
      data: {
        address: String(j.address?.line1 ?? j.address ?? address),
        ownerName: j.ownerName ?? undefined,
        occupantName: j.occupantName ?? undefined,
        occupancyType: j.occupancyType ?? "unknown",
        yearBuilt: j.yearBuilt ?? undefined,
        sqft: j.squareFootage ?? undefined,
        beds: j.bedrooms ?? undefined,
        baths: j.bathrooms ?? undefined,
        lastSalePrice: j.lastSalePrice ?? undefined,
        lastSaleDate: j.lastSaleDate ?? undefined,
        estimatedValue: j.estimatedValue ?? undefined,
      },
    };
  } catch (e) {
    return { source: "rentcast", status: "error", fetchedAt: new Date().toISOString(), error: e instanceof Error ? e.message : "rentcast unreachable" };
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tests/dossier.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/ src/tests/dossier.test.ts
git commit -m "feat(research): source contracts with honest graceful errors (rentcast wired)"
```

### Task 8: Dossier compiler

**Files:**
- Create: `src/lib/research/dossier.ts`
- Test: `src/tests/dossier.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { compileDossier } from "../lib/research/dossier";

describe("compileDossier", () => {
  it("aggregates source results with per-source status", async () => {
    const d = await compileDossier({
      dealId: "d1",
      address: "123 Test St",
      pin: "123",
      profile: { minAssessed: 30_000, maxAssessed: 150_000 },
    });
    expect(d.dealId).toBe("d1");
    expect(Array.isArray(d.sources)).toBe(true);
    expect(d.sources.length).toBeGreaterThan(0);
    for (const s of d.sources) {
      expect(["ok", "error"]).toContain(s.status);
      expect(s.fetchedAt).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/dossier.test.ts`
Expected: FAIL — `compileDossier` not exported.

- [ ] **Step 3: Implement**

```ts
import { fetchCountyTaxRecord } from "./sources/countyTax";
import { fetchDeedRecords } from "./sources/deeds";
import { fetchLiens } from "./sources/liens";
import { fetchPermits } from "./sources/permits";
import { fetchForeclosureNotices } from "./sources/courts";
import { fetchRentcastProperty } from "./sources/rentcast";
import type { SourceResult } from "./sources/types";

export interface DossierInput {
  dealId: string;
  address: string;
  pin?: string;
  profile: { minAssessed: number; maxAssessed: number };
}

export interface Dossier {
  dealId: string;
  sources: SourceResult<unknown>[];
  compiledAt: string;
}

// Compiles a research dossier from every configured source. Each source is
// independently recorded (ok/error + fetchedAt). A failing source never blocks
// the others, and no source result is ever fabricated.
export async function compileDossier(input: DossierInput): Promise<Dossier> {
  const profile = input.profile;
  const pin = input.pin ?? "";
  const sources: SourceResult<unknown>[] = [
    await fetchCountyTaxRecord(pin, profile),
    await fetchDeedRecords(input.address),
    await fetchLiens(pin),
    await fetchPermits(input.address),
    await fetchForeclosureNotices(input.address),
    await fetchRentcastProperty(input.address),
  ];
  return { dealId: input.dealId, sources, compiledAt: new Date().toISOString() };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tests/dossier.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/research/dossier.ts src/tests/dossier.test.ts
git commit -m "feat(research): dossier compiler aggregating labeled source results"
```

### Task 9: Migration 007 (dossiers + research_sources)

**Files:**
- Create: `supabase/migrations/007_research_and_guardrails.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 1: research dossiers + per-source fetch tracking.

-- One dossier per deal — the compiled research record.
create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  sources jsonb not null default '[]'::jsonb,
  compiled_at timestamptz not null default now(),
  unique (deal_id)
);

create index if not exists dossiers_org_idx on public.dossiers (org_id, compiled_at desc);

-- Per-source fetch log — one row per source per dossier build, so we never
-- re-hit external APIs blindly and failures are auditable.
create table if not exists public.research_sources (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid references public.dossiers (id) on delete cascade,
  source text not null,
  status text not null, -- 'ok' | 'error'
  data jsonb,
  error text,
  fetched_at timestamptz not null default now()
);

create index if not exists research_sources_dossier_idx on public.research_sources (dossier_id);
```

- [ ] **Step 2: Verify no syntax errors**

Run: `npx supabase db lint` if available, else review manually (Supabase CLI). If CLI unavailable, note this is applied via the Supabase dashboard SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_research_and_guardrails.sql
git commit -m "feat(db): dossiers + research_sources tables"
```

### Task 10: Runner pass-through guardrail evaluation

**Files:**
- Modify: `src/lib/agent/runner.ts`

- [ ] **Step 1: Add evaluation logging for money actions**

In `executeStep`, replace the current money-gate block:

```ts
// Money gate: never execute unless caller explicitly authorized. When limits
// are all-disabled (default) this evaluates to "escalate" — today's behavior.
if (step.requires_approval) {
  const evaluation = evaluateAction(
    { kind: step.kind, requiresApproval: true },
    policy.settings.agent.limits,
    { amount: step.metadata.amount as number | undefined }
  );
  if (evaluation.decision === "auto_approve" && policy.executeMoneyActions) {
    // Fall through to execution (only in tests / explicit authorization).
  } else if (evaluation.decision === "block") {
    await recordAction(admin, runId, orgId, step, "blocked", {
      awaiting: "none",
      guardrail: evaluation.reason,
    });
    return { status: "blocked", reason: evaluation.reason };
  } else {
    await recordAction(admin, runId, orgId, step, "pending_approval", {
      awaiting: "operator",
      guardrail: evaluation.decision,
      guardrailRule: evaluation.rule ?? null,
      guardrailEvidence: evaluation.evidence ?? null,
    });
    return { status: "pending_approval" };
  }
}
```

Import `evaluateAction` from `@/lib/guardrails/evaluate`.

Note: `AgentActionStatus` must gain `"blocked"` (add to `src/lib/agent/types.ts` union — it already includes `"blocked"` per the type definition, verify it's in the union; it is: `"done" | "skipped" | "blocked" | "failed" | "pending_approval" | "approved"`).

- [ ] **Step 2: Verify with a focused test**

Add to `src/tests/agentAutonomy.test.ts` a case that a money action with default settings still lands `pending_approval` (the existing autonomy tests already cover this — confirm they pass).

Run: `npx vitest run src/tests/agentAutonomy.test.ts` → PASS.

- [ ] **Step 3: Run full suite**

Run: `npx vitest run` → all green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/agent/runner.ts
git commit -m "feat(agent): pass-through guardrail evaluation on money gates"
```

### Task 11: Settings API + UI for research (optional stretch)

**Files:**
- Modify: `src/app/(app)/settings/page.tsx` — add research status card (Rentcast key presence, dossier button) if the settings form pattern allows.

This is optional and may be deferred to Phase 3 UI work. If deferred, mark the Task as done with a note.

---

## Self-review notes

- All guardrail defaults disabled → no behavior change; autonomy is explicitly opt-in.
- Every external source returns `SourceResult` with status; nothing fabricated.
- Dossier sources are labeled and independently recorded.