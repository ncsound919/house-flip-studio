// Bank-readiness: track record ledger (the lender "brag sheet").
// Deterministic. Realized rows come only from Closed deals with a real sale
// price; everything else is labeled projected. Reuses computeDealPnl as the
// single source of truth for profit/ROI so this never disagrees with the
// dashboard.

import { computeDealPnl } from "./pnl";

export interface TrackRecordDeal {
  id: string;
  address: string;
  city: string | null;
  state: string;
  stage: string;
  created_at: string;
  stage_changed_at: string | null;
  final_sale_price?: number | null;
}

export interface TrackRecordUnderwriting {
  deal_id: string;
  purchase_price?: number | null;
  acquisition_costs?: number | null;
  financing_costs?: number | null;
  selling_costs?: number | null;
  projected_profit?: number | null;
  arv?: number | null;
}

export interface TrackRecordInput {
  deals: TrackRecordDeal[];
  underwriting: TrackRecordUnderwriting[];
  rehabActualByDeal: Record<string, number>;
}

export interface TrackRecordRow {
  dealId: string;
  address: string;
  city: string | null;
  state: string;
  stage: string;
  isRealized: boolean;
  salePrice: number | null;
  purchasePrice: number | null;
  acquisitionCosts: number | null;
  rehabActual: number | null;
  financingCosts: number | null;
  sellingCosts: number | null;
  holdingMonths: number | null;
  cycleDays: number | null;
  profit: number | null;
  roi: number | null;
}

const num = (n: number | null | undefined) =>
  Number.isFinite(n) && n != null ? Number(n) : null;

const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));

export function buildTrackRecord(input: TrackRecordInput): TrackRecordRow[] {
  const uwById = new Map(input.underwriting.map((u) => [u.deal_id, u]));

  const rows = input.deals.map((d): TrackRecordRow => {
    const uw = uwById.get(d.id);
    const finalSalePrice = Number(d.final_sale_price) > 0 ? Number(d.final_sale_price) : null;
    const purchasePrice = num(uw?.purchase_price);
    const acquisitionCosts = num(uw?.acquisition_costs);
    const financingCosts = num(uw?.financing_costs);
    const sellingCosts = num(uw?.selling_costs);
    const rehabActual =
      input.rehabActualByDeal[d.id] != null ? input.rehabActualByDeal[d.id] : null;

    const pnl = computeDealPnl({
      stage: d.stage,
      finalSalePrice,
      purchasePrice,
      acquisitionCosts,
      rehabActual,
      financingCosts,
      sellingCosts,
      projectedProfit: num(uw?.projected_profit),
      projectedArv: num(uw?.arv),
    });

    const cycleDays =
      d.stage === "Closed" && d.created_at && d.stage_changed_at
        ? daysBetween(d.created_at, d.stage_changed_at)
        : null;
    const holdingMonths = cycleDays != null ? Math.max(1, Math.round(cycleDays / 30)) : null;

    return {
      dealId: d.id,
      address: d.address,
      city: d.city,
      state: d.state,
      stage: d.stage,
      isRealized: pnl.isRealized,
      salePrice: pnl.finalSalePrice,
      purchasePrice,
      acquisitionCosts,
      rehabActual,
      financingCosts,
      sellingCosts,
      holdingMonths,
      cycleDays,
      profit: pnl.isRealized ? pnl.realizedProfit : pnl.projectedProfit,
      roi: pnl.roi,
    };
  });

  // Realized rows first (lender-facing), then projected, preserving input order.
  return rows.sort((a, b) => Number(b.isRealized) - Number(a.isRealized));
}

export interface TrackRecordSummary {
  realizedCount: number;
  realizedProfit: number;
  avgProfit: number | null;
  avgCycleDays: number | null;
  totalInvested: number;
  roi: number | null;
}

export function computeTrackRecordSummary(rows: TrackRecordRow[]): TrackRecordSummary {
  const realized = rows.filter((r) => r.isRealized && r.profit != null);
  const profitSum = realized.reduce((s, r) => s + (r.profit ?? 0), 0);
  const totalInvested = realized.reduce(
    (s, r) =>
      s +
      (r.purchasePrice ?? 0) +
      (r.acquisitionCosts ?? 0) +
      (r.rehabActual ?? 0),
    0
  );
  const cycles = realized.filter((r) => r.cycleDays != null);
  const avgCycleDays =
    cycles.length > 0
      ? Math.round(cycles.reduce((s, r) => s + (r.cycleDays ?? 0), 0) / cycles.length)
      : null;
  const roi = totalInvested > 0 ? Math.round((profitSum / totalInvested) * 100) : null;

  return {
    realizedCount: realized.length,
    realizedProfit: profitSum,
    avgProfit: realized.length > 0 ? Math.round(profitSum / realized.length) : null,
    avgCycleDays,
    totalInvested,
    roi,
  };
}
