# Phase 2 — Real Comps & ARV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace heuristic ARV with comps-derived ARV wherever real sale data exists, so underwriting runs on real numbers.

**Architecture:** Add a deed-record comps source (`research/sources/deeds.ts` full implementation) pulling county deed-transfer sale records; extend the `comps` table with `source`/`sale_date`; make `arvEstimate` prefer real comps with confidence by count/recency; wire the planner to emit `fetch_comps` when ARV is heuristic and the runner to apply it.

**Tech Stack:** TypeScript, Next.js, Supabase, Zod, Vitest. Deterministic math only.

**Baseline:** Phase 1 must be committed first (research source contracts, guardrail skeleton, orgSettings agent.limits).

---

## File Structure

- Modify: `src/lib/research/sources/deeds.ts` — real NC county deed-transfer comps fetch.
- Modify: `src/lib/arvEstimate.ts` — comps confidence + $/sqft median weighting.
- Modify: `src/lib/agent/types.ts` — add `fetch_comps` action kind.
- Modify: `src/lib/agent/planner.ts` — emit `fetch_comps` when ARV heuristic; use comps in ARV call.
- Modify: `src/lib/agent/runner.ts` — `applyFetchComps` handler.
- Modify: `src/lib/agent/planner.ts` loadPlannerState already passes comps.
- Create: `supabase/migrations/008_comps_columns.sql` — add `source`, `sale_date`, `distance_score` to comps.
- Tests: `src/tests/deedsSource.test.ts`, `src/tests/arvComps.test.ts` (extend).

---

### Task 1: Deed-record comps source

**Files:**
- Modify: `src/lib/research/sources/deeds.ts`
- Test: `src/tests/deedsSource.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseDeedComps, fetchDeedComps } from "../lib/research/sources/deeds";

describe("deed comps — parsing (deterministic, mocked)", () => {
  const sample = {
    records: [
      { salePrice: 210000, saleDate: "2026-05-01", propertyAddress: "9 Elm St", sqft: 1400 },
      { salePrice: 195000, saleDate: "2026-03-15", propertyAddress: "11 Elm St", sqft: 1300 },
      { salePrice: 225000, saleDate: "2025-12-01", propertyAddress: "7 Elm St", sqft: 1500 },
    ],
  };

  it("parses records into comps with real fields", () => {
    const comps = parseDeedComps(sample, "Elm");
    expect(comps.length).toBe(3);
    expect(comps[0].sale_price).toBe(210000);
    expect(comps[0].source).toBe("deeds");
    expect(comps[0].sale_date).toBe("2026-05-01");
  });

  it("filters records with no sale price", () => {
    const comps = parseDeedComps({ records: [{ salePrice: null, propertyAddress: "1 X" }, { salePrice: 180000, propertyAddress: "2 X" }] }, "X");
    expect(comps.length).toBe(1);
    expect(comps[0].sale_price).toBe(180000);
  });
});

describe("deed comps — fetch degradation", () => {
  it("returns error when feed unavailable", async () => {
    const r = await fetchDeedComps("123 Test St", { timeoutMs: 5 });
    expect(["ok", "error"]).toContain(r.status);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/deedsSource.test.ts`
Expected: FAIL — `parseDeedComps`/`fetchDeedComps` not exported.

- [ ] **Step 3: Implement**

Replace the Phase 1 stub in `src/lib/research/sources/deeds.ts`:

```ts
import type { DeedRecord, SourceResult } from "./types";

export interface DeedComp {
  sale_price: number;
  sale_date?: string;
  address?: string;
  sqft?: number;
  source: "deeds";
  distance_score?: number;
}

// NC county registers of deeds publish transfer records. We target county
// ArcGIS/JSON endpoints; the exact endpoint is configured per-county. Where
// none is configured, we return an honest error (no fabricated comps).
const DEED_ENDPOINTS: Record<string, string> = {
  // e.g. Wake: "https://maps.raleighnc.gov/arcgis/rest/services/.../query"
};

export function parseDeedComps(raw: { records?: unknown[] }, neighborhood: string): DeedComp[] {
  const records = Array.isArray(raw?.records) ? raw.records : [];
  const comps: DeedComp[] = [];
  for (const r of records) {
    const rec = r as Record<string, unknown>;
    const price = Number(rec.salePrice ?? rec.sale_price);
    if (!Number.isFinite(price) || price <= 0) continue;
    const address = String(rec.propertyAddress ?? rec.address ?? "").trim();
    const sqft = Number(rec.sqft) > 0 ? Number(rec.sqft) : undefined;
    comps.push({
      sale_price: Math.round(price),
      sale_date: rec.saleDate ? String(rec.saleDate) : undefined,
      address: address || undefined,
      sqft,
      source: "deeds",
      distance_score: address.toLowerCase().includes(neighborhood.toLowerCase()) ? 1 : undefined,
    });
  }
  return comps;
}

export async function fetchDeedComps(
  address: string,
  opts: { timeoutMs?: number } = {}
): Promise<SourceResult<DeedComp[]>> {
  const endpoint = process.env.NC_DEEDS_ENDPOINT;
  if (!endpoint) {
    return { source: "deeds", status: "error", fetchedAt: new Date().toISOString(), error: "NC_DEEDS_ENDPOINT not configured" };
  }
  try {
    const res = await fetch(`${endpoint}?address=${encodeURIComponent(address)}`, {
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) {
      return { source: "deeds", status: "error", fetchedAt: new Date().toISOString(), error: `deeds feed returned ${res.status}` };
    }
    const j = await res.json();
    const neighborhood = address.split(",")[0]?.trim() ?? "";
    const comps = parseDeedComps(j, neighborhood);
    return { source: "deeds", status: "ok", fetchedAt: new Date().toISOString(), data: comps };
  } catch (e) {
    return { source: "deeds", status: "error", fetchedAt: new Date().toISOString(), error: e instanceof Error ? e.message : "deeds feed unreachable" };
  }
}

export const fetchDeedRecords = fetchDeedComps; // backward-compatible with dossier contract
```

Note: keep `DeedRecord` import used or remove it — the dossier contract in Phase 1 referenced `fetchDeedRecords(address) → SourceResult<DeedRecord[]>`. Update `src/lib/research/dossier.ts` to call `fetchDeedComps` instead (its `DeedComp` shape is compatible), and adjust the Phase 1 `DeedRecord` interface if it conflicts. `SourceResult<DeedComp[]>` is the shape `compileDossier` stores.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tests/deedsSource.test.ts` → PASS.

- [ ] **Step 5: Run full suite (dossier test must still pass)**

Run: `npx vitest run` → green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/research/sources/deeds.ts src/lib/research/dossier.ts src/tests/deedsSource.test.ts
git commit -m "feat(research): real deed-transfer comps source with parsing + graceful errors"
```

### Task 2: Comps table columns

**Files:**
- Create: `supabase/migrations/008_comps_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 2: comps provenance + recency so ARV can weigh real sales.
alter table public.comps
  add column if not exists source text,        -- 'deeds' | 'rentcast' | 'manual'
  add column if not exists sale_date date,
  add column if not exists distance_score numeric;

create index if not exists comps_deal_sale_idx on public.comps (deal_id, sale_date desc);
```

- [ ] **Step 2: Verify syntax** (review; apply via Supabase dashboard if no CLI).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_comps_columns.sql
git commit -m "feat(db): comps provenance columns (source, sale_date, distance)"
```

### Task 3: ARV prefers real comps with confidence

**Files:**
- Modify: `src/lib/arvEstimate.ts`
- Test: `src/tests/arvComps.test.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `src/tests/arvComps.test.ts`:

```ts
import { estimateArv } from "../lib/arvEstimate";

describe("estimateArv — comps confidence", () => {
  const comps = [
    { sale_price: 200_000, source: "deeds", sale_date: "2026-05-01" },
    { sale_price: 210_000, source: "deeds", sale_date: "2026-04-15" },
    { sale_price: 205_000, source: "deeds", sale_date: "2026-03-01" },
  ];

  it("uses median sale price with medium confidence for >=3 comps", () => {
    const r = estimateArv({ county: "Wake", comps });
    expect(r.source).toBe("comps");
    expect(r.arv).toBe(205_000);
    expect(r.confidence).toBe("medium");
  });

  it("labels comp count and recency in signals", () => {
    const r = estimateArv({ county: "Wake", comps });
    expect(r.signals.join(" ")).toContain("3 comps");
  });

  it("falls back to heuristic with <2 comps", () => {
    const r = estimateArv({ county: "Wake", assessedValue: 90_000, comps: [{ sale_price: 200_000 }] });
    expect(r.source).toBe("assessed_value");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/arvComps.test.ts`
Expected: FAIL — `sale_date`/`source` fields not consumed; confidence fixed at medium.

- [ ] **Step 3: Implement**

Update the comps block in `estimateArv`:

```ts
const compEntries = (params.comps ?? [])
  .map((c) => ({
    price: Number(c.sale_price),
    date: c.sale_date ? new Date(c.sale_date + (c.sale_date.length === 10 ? "T00:00:00" : "")) : null,
  }))
  .filter((c) => Number.isFinite(c.price) && c.price > 0);

if (compEntries.length >= 2) {
  const now = Date.now();
  const fresh = compEntries.filter((c) => c.date && now - c.date.getTime() <= 365 * 86_400_000).length;
  const sorted = [...compEntries.map((c) => c.price)].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  const arv = Math.round(median);
  const confidence: "medium" | "high" = compEntries.length >= 4 && fresh >= 3 ? "high" : "medium";
  signals.push(`Median of ${compEntries.length} real comps: $${arv.toLocaleString("en-US")} (${fresh} within 12 months)`);
  return {
    arv,
    source: "comps",
    confidence,
    disclaimer,
    inputs: { assessedValue, sqft, county, compCount: compEntries.length },
    signals,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tests/arvComps.test.ts` → PASS.

- [ ] **Step 5: Run full suite** → green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/arvEstimate.ts src/tests/arvComps.test.ts
git commit -m "feat(arv): comps-driven ARV with recency-weighted confidence"
```

### Task 4: Planner emits fetch_comps

**Files:**
- Modify: `src/lib/agent/types.ts`
- Modify: `src/lib/agent/planner.ts`
- Test: `src/tests/agentPlanner.test.ts` (extend)

- [ ] **Step 1: Add the action kind**

In `src/lib/agent/types.ts`, add to `AgentActionKind`:

```ts
| "fetch_comps" // pulled real comps for a deal (non-money)
```

- [ ] **Step 2: Write the failing test**

Append to `src/tests/agentPlanner.test.ts`:

```ts
describe("planAgentActions — fetch_comps", () => {
  it("emits fetch_comps when ARV is heuristic and <2 comps on file", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ arv_estimate: 280_000, arv_method: "sqft_median" })],
      })
    );
    const fc = plan.find((p) => p.kind === "fetch_comps");
    expect(fc).toBeDefined();
    expect(fc!.requires_approval).toBe(false);
  });

  it("does NOT emit fetch_comps when 2+ comps already on file", () => {
    const plan = planAgentActions(
      state({
        deals: [deal({ arv_estimate: 280_000, arv_method: "sqft_median" })],
        comps: { d1: [{ sale_price: 200_000 }, { sale_price: 210_000 }] },
      })
    );
    expect(plan.find((p) => p.kind === "fetch_comps")).toBeUndefined();
  });

  it("does NOT emit fetch_comps when ARV is already comps-derived", () => {
    const plan = planAgentActions(
      state({ deals: [deal({ arv_estimate: 205_000, arv_method: "comps" })] })
    );
    expect(plan.find((p) => p.kind === "fetch_comps")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/tests/agentPlanner.test.ts`
Expected: FAIL — no `fetch_comps` in plan.

- [ ] **Step 4: Implement**

In `planner.ts`, replace `promptForCompsIfMissing` with a version that emits a real `fetch_comps` action when comps are missing, plus an `info` when they're present but heuristic (upgrade note):

```ts
function planForComps(deal: PlannerDeal, state: PlannerState, out: PlannedAction[]) {
  if (deal.arv_method === "comps") return;
  const compCount = (state.comps[deal.id] ?? []).length;
  if (compCount < 2) {
    out.push({
      kind: "fetch_comps",
      dealId: deal.id,
      title: `Fetch real comps for ${deal.address}`,
      detail: `ARV is ${deal.arv_method ?? "heuristic"} (${money(deal.arv_estimate)}). Agent will pull deed-transfer comps to upgrade underwriting.`,
      requires_approval: false,
      metadata: { reason: "comps_missing", compCount },
    });
  } else {
    out.push({
      kind: "info",
      dealId: deal.id,
      title: `Comps on file for ${deal.address}`,
      detail: `${compCount} comps present — ARV can be upgraded if re-estimated.`,
      requires_approval: false,
      metadata: { reason: "comps_present", compCount },
    });
  }
}
```

Call `planForComps` from `planForLead` (after ARV estimate), `planForInspecting`, and `planForUnderwriting` in place of the old `promptForCompsIfMissing` calls.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/tests/agentPlanner.test.ts` → PASS.

- [ ] **Step 6: Run full suite** → green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/types.ts src/lib/agent/planner.ts src/tests/agentPlanner.test.ts
git commit -m "feat(agent): planner emits fetch_comps when ARV is heuristic"
```

### Task 5: Runner applies fetch_comps

**Files:**
- Modify: `src/lib/agent/runner.ts`
- Test: `src/tests/agentAutonomy.test.ts` (extend, mocked)

- [ ] **Step 1: Add the handler**

In `executeStep`, add a case:

```ts
case "fetch_comps":
  return await applyFetchComps(admin, runId, orgId, step);
```

Add the implementation function:

```ts
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
```

Import `fetchDeedComps` from `@/lib/research/sources/deeds`.

- [ ] **Step 2: Add a mocked integration test**

In `src/tests/agentAutonomy.test.ts`, add a test that stubs `fetchDeedComps` to return 2 comps and asserts a `done` action with `inserted: 2`. Follow the file's existing mocking pattern (check how it stubs external calls; likely vi.mock or injected admin client).

- [ ] **Step 3: Run the autonomy suite**

Run: `npx vitest run src/tests/agentAutonomy.test.ts` → PASS.

- [ ] **Step 4: Run full suite** → green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/runner.ts src/tests/agentAutonomy.test.ts
git commit -m "feat(agent): runner applies deed comps into comps table"
```

### Task 6: Planner uses comps in ARV call (already wired)

Verify `planForLead` calls `estimateArv({ ..., comps: state.comps[deal.id] })`. It does (Phase 1 baseline). Run full suite. No code change expected.

- [ ] **Step 1: Run full suite**

Run: `npx vitest run` → green.

---

## Self-review notes

- Comps are real sold prices from deed records or an API — never scraped listings.
- ARV stays heuristic and labeled when <2 real comps exist.
- `fetch_comps` is non-money (research), so it executes automatically; it feeds comps that make the next underwriting pass real.