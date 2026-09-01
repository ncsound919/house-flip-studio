// Contractor scorecard — the outcome-flywheel seed. Deterministic.
//
// Each contractor's performance from real ledger rows: how much they bid, how
// much their work actually cost, their change-order rate, and how often they
// finish. Ratings are a documented heuristic over recorded variance — never a
// claim about quality that the data can't support.

export interface ScorecardItem {
  id: string;
  contractor_id: string | null;
  contractor_name: string | null;
  trade: string | null;
  status: string; // estimated | contracted | in_progress | completed
  estimated_cost: number;
  actual_cost: number;
}

export interface ScorecardChangeOrder {
  rehab_item_id: string;
  status: string;
  cost_impact: number;
}

export interface ContractorScorecard {
  id: string;
  name: string;
  trade: string | null;
  bidTotal: number;
  actualTotal: number;
  variancePct: number | null;
  changeOrderCount: number;
  completedItems: number;
  activeItems: number;
  rating: "reliable" | "average" | "at_risk";
}

const COMMITTED_STATUSES = new Set(["contracted", "in_progress", "completed"]);

export function computeContractorScorecards(
  items: ScorecardItem[],
  changeOrders: ScorecardChangeOrder[]
): ContractorScorecard[] {
  const byContractor = new Map<string, { name: string; trade: string | null; items: ScorecardItem[] }>();

  for (const item of items) {
    if (!item.contractor_id) continue;
    const key = item.contractor_id;
    const entry = byContractor.get(key) ?? { name: item.contractor_name ?? "Contractor", trade: item.trade ?? null, items: [] };
    entry.items.push(item);
    byContractor.set(key, entry);
  }

  const approvedByItem = new Map<string, number>();
  for (const co of changeOrders) {
    if (co.status !== "approved") continue;
    approvedByItem.set(co.rehab_item_id, (approvedByItem.get(co.rehab_item_id) ?? 0) + (Number(co.cost_impact) || 0));
  }

  const out: ContractorScorecard[] = [];
  for (const [id, entry] of byContractor) {
    const bidTotal = entry.items.reduce((s, i) => s + (Number(i.estimated_cost) || 0), 0);
    const actualTotal = entry.items.reduce((s, i) => s + (Number(i.actual_cost) || 0), 0);
    const completed = entry.items.filter((i) => i.status === "completed");
    const active = entry.items.filter((i) => COMMITTED_STATUSES.has(i.status)).length;
    const changeOrderCount = entry.items.reduce((s, i) => s + (approvedByItem.get(i.id) ? 1 : 0), 0);

    const variancePct =
      bidTotal > 0 ? Math.round(((actualTotal - bidTotal) / bidTotal) * 100) : null;

    const rating: ContractorScorecard["rating"] =
      variancePct == null ? "average" : variancePct <= 10 ? "reliable" : variancePct <= 25 ? "average" : "at_risk";

    out.push({
      id,
      name: entry.name,
      trade: entry.trade,
      bidTotal,
      actualTotal,
      variancePct,
      changeOrderCount,
      completedItems: completed.length,
      activeItems: active,
      rating,
    });
  }

  return out.sort((a, b) => (b.bidTotal || 0) - (a.bidTotal || 0));
}
