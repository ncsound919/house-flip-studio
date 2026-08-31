# Phase 4 — Business Operations & KPIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The system tracks the business, not just deals — realized vs projected P&L, financing/draws, portfolio KPIs. All deterministic from real DB state.

**Architecture:** A `finance/` module computes deal P&L from real rows (`payments`, `deals`, `underwriting`, `rehab_items`); new `finance` table holds per-deal snapshots; the dashboard extends with cash flow, cycle time, hit rate, ROI; CommandCenter surfaces "Business pulse". Realized figures only from Closed deals with actuals; anything else labeled projected/heuristic.

**Tech Stack:** TypeScript, Next.js, Supabase, Zod, Vitest.

**Baseline:** Phases 1–3 committed (payments table from Phase 3, agent telemetry, real comps).

---

## File Structure

- Create: `src/lib/finance/pnl.ts` — deterministic P&L computation.
- Create: `src/lib/finance/portfolio.ts` — portfolio aggregates (cash flow, cycle time, hit rate, ROI).
- Create: `supabase/migrations/010_finance.sql` — `finance` snapshot table.
- Modify: `src/app/api/dashboard/route.ts` — add finance KPIs.
- Modify: `src/components/command/CommandCenter.tsx` — "Business pulse" section.
- Modify: `src/lib/agent/types.ts` — AgentRunSummary already has telemetry.
- Tests: `src/tests/pnl.test.ts`, `src/tests/portfolio.test.ts`.

---

### Task 1: Deal-level P&L

**Files:**
- Create: `src/lib/finance/pnl.ts`
- Test: `src/tests/pnl.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeDealPnl } from "../lib/finance/pnl";

describe("computeDealPnl — realized", () => {
  it("computes realized P&L from a Closed deal with actuals", () => {
    const pnl = computeDealPnl({
      stage: "Closed",
      finalSalePrice: 220_000,
      purchasePrice: 150_000,
      acquisitionCosts: 3_000,
      rehabActual: 30_000,
      holdingMonths: 5,
      financingCosts: 6_000,
      sellingCosts: 17_600,
    });
    expect(pnl.realizedProfit).toBe(13_400); // 220000 - 150000 - 3000 - 30000 - 6000 - 17600
    expect(pnl.isRealized).toBe(true);
    expect(pnl.label).toBe("realized");
  });

  it("flags open deals as projected and uses underwriting projections", () => {
    const pnl = computeDealPnl({
      stage: "Rehab",
      finalSalePrice: null,
      purchasePrice: 150_000,
      acquisitionCosts: 3_000,
      rehabActual: 12_000,
      projectedRehab: 30_000,
      holdingMonths: 4,
      financingCosts: 4_800,
      projectedSellingCosts: 16_000,
      projectedArv: 200_000,
    });
    expect(pnl.isRealized).toBe(false);
    expect(pnl.label).toBe("projected");
    expect(pnl.projectedProfit).toBeGreaterThan(0);
  });
});

describe("computeDealPnl — honesty", () => {
  it("never fabricates a sale price for open deals", () => {
    const pnl = computeDealPnl({
      stage: "Lead", finalSalePrice: null, purchasePrice: 0, acquisitionCosts: 0,
      rehabActual: 0, holdingMonths: 0, financingCosts: 0, sellingCosts: 0,
    });
    expect(pnl.finalSalePrice).toBeNull();
    expect(pnl.isRealized).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/pnl.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/finance/pnl.ts`:

```ts
export interface DealPnlInput {
  stage: string;
  finalSalePrice?: number | null;
  purchasePrice?: number | null;
  acquisitionCosts?: number | null;
  rehabActual?: number | null;
  projectedRehab?: number | null;
  holdingMonths?: number | null;
  financingCosts?: number | null;
  sellingCosts?: number | null;
  projectedSellingCosts?: number | null;
  projectedArv?: number | null;
  projectedProfit?: number | null; // from underwriting row
}

export interface DealPnl {
  stage: string;
  isRealized: boolean;
  label: "realized" | "projected";
  finalSalePrice: number | null;
  realizedProfit: number | null;
  projectedProfit: number | null;
  totalActualCost: number | null;
  roi: number | null;
}

const num = (n: number | null | undefined) =>
  Number.isFinite(n) && n != null ? Number(n) : 0;

// DETERMINISTIC: realized P&L only from Closed deals with a real sale price.
// Open deals are projected from underwriting rows and labeled as such.
export function computeDealPnl(input: DealPnlInput): DealPnl {
  const isRealized = input.stage === "Closed" && Number(input.finalSalePrice) > 0;
  if (isRealized) {
    const sale = num(input.finalSalePrice);
    const totalActualCost =
      num(input.purchasePrice) +
      num(input.acquisitionCosts) +
      num(input.rehabActual) +
      num(input.financingCosts) +
      num(input.sellingCosts) +
      // holding costs derived: purchase * 0.15% per month
      num(input.purchasePrice) * 0.0015 * num(input.holdingMonths);
    const realizedProfit = Math.round(sale - totalActualCost);
    const roi = totalActualCost > 0 ? Math.round((realizedProfit / totalActualCost) * 100) : null;
    return {
      stage: input.stage,
      isRealized: true,
      label: "realized",
      finalSalePrice: sale,
      realizedProfit,
      projectedProfit: null,
      totalActualCost: Math.round(totalActualCost),
      roi,
    };
  }
  // Projected: use the underwriting projected profit if present, else derive.
  const projectedProfit =
    num(input.projectedProfit) > 0
      ? Math.round(num(input.projectedProfit))
      : Math.round(num(input.projectedArv) - (
          num(input.purchasePrice) +
          num(input.acquisitionCosts) +
          num(input.projectedRehab) +
          num(input.projectedSellingCosts) +
          num(input.financingCosts)
        ));
  return {
    stage: input.stage,
    isRealized: false,
    label: "projected",
    finalSalePrice: null,
    realizedProfit: null,
    projectedProfit,
    totalActualCost: null,
    roi: null,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tests/pnl.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/pnl.ts src/tests/pnl.test.ts
git commit -m "feat(finance): deterministic deal P&L (realized vs projected)"
```

### Task 2: Portfolio aggregates

**Files:**
- Create: `src/lib/finance/portfolio.ts`
- Test: `src/tests/portfolio.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computePortfolioMetrics, type PortfolioInput } from "../lib/finance/portfolio";

describe("computePortfolioMetrics", () => {
  const input: PortfolioInput = {
    deals: [
      { id: "d1", stage: "Closed", createdAt: "2026-01-01T00:00:00Z", stageChangedAt: "2026-01-01T00:00:00Z" },
      { id: "d2", stage: "Rehab", createdAt: "2026-03-01T00:00:00Z", stageChangedAt: "2026-03-01T00:00:00Z" },
      { id: "d3", stage: "Listed", createdAt: "2026-05-01T00:00:00Z", stageChangedAt: "2026-05-01T00:00:00Z" },
    ],
    pnls: {
      d1: { isRealized: true, realizedProfit: 13_400, finalSalePrice: 220_000 },
      d2: { isRealized: false, projectedProfit: 18_000 },
      d3: { isRealized: false, projectedProfit: 9_000 },
    },
  };

  it("computes pipeline value as sum of open projected profit", () => {
    const m = computePortfolioMetrics(input);
    expect(m.pipelineValue).toBe(27_000);
  });

  it("computes realized profit sum and count", () => {
    const m = computePortfolioMetrics(input);
    expect(m.realizedProfit).toBe(13_400);
    expect(m.realizedCount).toBe(1);
  });

  it("computes average cycle time only from Closed deals", () => {
    const m = computePortfolioMetrics(input);
    expect(m.averageCycleDays).toBeTypeOf("number");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/tests/portfolio.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/finance/portfolio.ts`:

```ts
export interface PortfolioDeal {
  id: string;
  stage: string;
  createdAt: string;
  stageChangedAt: string;
}

export interface PortfolioDealPnl {
  isRealized?: boolean;
  realizedProfit?: number | null;
  finalSalePrice?: number | null;
  projectedProfit?: number | null;
}

export interface PortfolioInput {
  deals: PortfolioDeal[];
  pnls: Record<string, PortfolioDealPnl>;
}

export interface PortfolioMetrics {
  pipelineValue: number;
  realizedProfit: number;
  realizedCount: number;
  averageCycleDays: number | null;
  openDealCount: number;
}

const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));

export function computePortfolioMetrics(input: PortfolioInput): PortfolioMetrics {
  let pipelineValue = 0;
  let realizedProfit = 0;
  let realizedCount = 0;
  const cycleDays: number[] = [];

  for (const d of input.deals) {
    const pnl = input.pnls[d.id];
    if (d.stage === "Closed") {
      if (pnl?.isRealized) {
        realizedProfit += Number(pnl.realizedProfit) || 0;
        realizedCount++;
      }
      cycleDays.push(daysBetween(d.createdAt, d.stageChangedAt));
    } else {
      pipelineValue += Number(pnl?.projectedProfit) || 0;
    }
  }

  const averageCycleDays =
    cycleDays.length > 0
      ? Math.round(cycleDays.reduce((s, n) => s + n, 0) / cycleDays.length)
      : null;

  return {
    pipelineValue,
    realizedProfit,
    realizedCount,
    averageCycleDays,
    openDealCount: input.deals.filter((d) => d.stage !== "Closed").length,
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/tests/portfolio.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/portfolio.ts src/tests/portfolio.test.ts
git commit -m "feat(finance): portfolio metrics (pipeline value, realized P&L, cycle time)"
```

### Task 3: Finance snapshot migration

**Files:**
- Create: `supabase/migrations/010_finance.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 4: per-deal finance snapshot (P&L), deterministic and labeled.
create table if not exists public.finance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  pnl jsonb not null,                  -- computeDealPnl output
  snapshot_at timestamptz not null default now(),
  unique (deal_id)
);

create index if not exists finance_org_idx on public.finance (org_id, snapshot_at desc);
```

- [ ] **Step 2: Verify + commit**

```bash
git add supabase/migrations/010_finance.sql
git commit -m "feat(db): finance snapshot table"
```

### Task 4: Dashboard finance KPIs

**Files:**
- Modify: `src/app/api/dashboard/route.ts`
- Test: `src/tests/portfolio.test.ts` (already covers the pure functions)

- [ ] **Step 1: Wire portfolio + finance KPIs into the dashboard**

In `GET`, after the existing `kpis` block, load the extra data and add to the response:

- `finance`: `realizedProfit`, `realizedCount`, `pipelineValue`, `averageCycleDays` via `computePortfolioMetrics`.
- `cashFlow`: monthly `{ month, in: closes, out: draws+payments }` — sum `payments` (Phase 3 table) grouped by month for `out`; sum Closed deal `final_sale_price` (need a `final_sale_price` column on deals — add fallback to `asking_price` if the column doesn't exist yet, or read from a `sales` record; see note) for `in`.
- `hitRate`: offers sent (`agent_actions` kind `send_offer` with status `approved`/`auto_approved`) → closed (`deals` stage `Closed`) ratio, labeled with the small sample size.
- `roi`: `realizedProfit / (sum purchasePrice of realized)` as a percentage.

Note on sale price: `deals` currently has no `final_sale_price`. Add to migration 010:

```sql
alter table public.deals
  add column if not exists final_sale_price numeric;
```

and populate it when a deal reaches Closed (in `applyAdvanceStage` / `approveAgentAction`, when advancing to `Closed`, copy `asking_price` → `final_sale_price` if not set, or leave null and let the operator fill it — HONESTY: prefer null unless the operator sets a real number; do NOT auto-fill from asking price and label it as the sale price).

- [ ] **Step 2: Extend the dashboard test if one exists**

Run: `npx vitest run` → green (pure functions already tested).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/dashboard/route.ts supabase/migrations/010_finance.sql
git commit -m "feat(dashboard): finance KPIs (realized P&L, pipeline value, cash flow, hit rate)"
```

### Task 5: CommandCenter business pulse

**Files:**
- Modify: `src/components/command/CommandCenter.tsx`

- [ ] **Step 1: Add the business pulse section**

Extend the existing "Business pulse" area (read CommandCenter.tsx first to match its structure) with cards for:
- Realized profit (closed, real) + count
- Pipeline value (open, projected — labeled "projected")
- Average cycle time (Lead→Closed, real deals only)
- Cash flow this month (in vs out, from real ledger)
- Hit rate (offers → closed, labeled with sample size)
- ROI (realized, on invested capital)

Label every number: realized numbers get a "real" badge; projected/heuristic get a "projected" badge. No number is presented as fact unless it comes from a Closed deal with actuals.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit` → PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/command/CommandCenter.tsx
git commit -m "feat(ui): business pulse cards with realized vs projected labels"
```

### Task 6: Wire finance snapshot into the agent (optional, low priority)

**Files:**
- Modify: `src/lib/agent/planner.ts` — emit `info`/`predict_exit` using `computeDealPnl`.

- [ ] **Step 1: Optional wiring**

In `planForRehab`/`planForListed`, enrich `predict_exit` with the P&L numbers from `computeDealPnl` (requires loading the deal's finance inputs into planner state). Keep the action non-money and labeled projected. This makes exit predictions real P&L-aware rather than bare ARV math.

- [ ] **Step 2: Run full suite + typecheck**

Run: `npx vitest run`; `npx tsc --noEmit` → both green.

- [ ] **Step 3: Commit**

```bash
git add src/lib/agent/planner.ts
git commit -m "feat(agent): exit prediction uses deal P&L"
```

---

## Self-review notes

- Realized P&L only from Closed deals with actuals; open deals labeled projected.
- Cash flow sums real `payments` + real closed sale prices (no fabricated sale numbers).
- Cycle time, hit rate, ROI all computed from real DB rows with documented assumptions.