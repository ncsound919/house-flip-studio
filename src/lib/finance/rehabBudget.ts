// Rehab budget control — the profit protector. Deterministic.
//
// Computes a deal's budget health from the real ledger:
//   originalEstimate   — sum of every line item's estimate
//   committed          — estimates on contracted / in-progress / completed items
//   actualSpend        — real recorded spend (actual_cost; includes approved
//                        change orders folded in by the change-order route)
//   projectedTotal     — completed items → actual, everything else → estimate
//   variance           — projectedTotal − originalEstimate
//   approvedChangeOrders — separate exposure number, never double-counted
//
// HONESTY: projected numbers are labeled projections. "Completed" only counts
// actuals. Nothing is invented where data is missing.

export interface BudgetItem {
  id: string;
  trade: string | null;
  status: string; // estimated | contracted | in_progress | completed
  estimated_cost: number;
  actual_cost: number;
}

export interface BudgetChangeOrder {
  rehab_item_id: string;
  status: string; // approved | pending | rejected
  cost_impact: number;
}

export type BudgetStatus = "on_track" | "at_risk" | "over_budget";

export interface RehabBudget {
  lineItems: number;
  originalEstimate: number;
  committed: number;
  actualSpend: number;
  remainingToCommit: number;
  projectedTotal: number;
  approvedChangeOrders: number;
  variance: number;
  variancePct: number;
  status: BudgetStatus;
  overBudgetTrades: { trade: string; variance: number }[];
}

const COMMITTED_STATUSES = new Set(["contracted", "in_progress", "completed"]);

export function computeRehabBudget(items: BudgetItem[], changeOrders: BudgetChangeOrder[]): RehabBudget {
  const originalEstimate = items.reduce((s, i) => s + (Number(i.estimated_cost) || 0), 0);
  const committed = items
    .filter((i) => COMMITTED_STATUSES.has(i.status))
    .reduce((s, i) => s + (Number(i.estimated_cost) || 0), 0);
  const actualSpend = items.reduce((s, i) => s + (Number(i.actual_cost) || 0), 0);
  const remainingToCommit = originalEstimate - committed;

  const projectedTotal = items.reduce(
    (s, i) => s + (i.status === "completed" ? Number(i.actual_cost) || 0 : Number(i.estimated_cost) || 0),
    0
  );

  const approvedChangeOrders = changeOrders
    .filter((co) => co.status === "approved")
    .reduce((s, co) => s + (Number(co.cost_impact) || 0), 0);

  const variance = projectedTotal - originalEstimate;
  const variancePct = originalEstimate > 0 ? Math.round((variance / originalEstimate) * 100) : 0;

  // Per-trade projected variance (completed → actual, else → estimate).
  const byTrade = new Map<string, { original: number; projected: number }>();
  for (const i of items) {
    const t = i.trade ?? "General";
    const b = byTrade.get(t) ?? { original: 0, projected: 0 };
    b.original += Number(i.estimated_cost) || 0;
    b.projected += i.status === "completed" ? Number(i.actual_cost) || 0 : Number(i.estimated_cost) || 0;
    byTrade.set(t, b);
  }
  const overBudgetTrades = [...byTrade.entries()]
    .map(([trade, b]) => ({ trade, variance: b.projected - b.original }))
    .filter((t) => t.variance > 0)
    .sort((a, b) => b.variance - a.variance);

  const status: BudgetStatus =
    originalEstimate > 0 && (variancePct >= 15 || overBudgetTrades.some((t) => t.variance > originalEstimate * 0.15))
      ? "over_budget"
      : variancePct >= 5
      ? "at_risk"
      : "on_track";

  return {
    lineItems: items.length,
    originalEstimate,
    committed,
    actualSpend,
    remainingToCommit,
    projectedTotal,
    approvedChangeOrders,
    variance,
    variancePct,
    status,
    overBudgetTrades,
  };
}
