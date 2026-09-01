// Server-side assembly of the calibration ledger from real DB rows. Realized
// profit reuses computeDealPnl so this can never disagree with the dashboard.

import { createAdminClient } from "@/lib/apiHelpers";
import { computeDealPnl } from "./pnl";
import { computeCalibration, type CalibrationDealInput, type DealCalibration, type MarketCalibration } from "./calibration";

export interface CalibrationPackage {
  deals: DealCalibration[];
  market: MarketCalibration;
  baselineRehabPerSqft: number;
}

interface UnderwritingRow {
  deal_id: string;
  arv: number | null;
  rehab_estimate: number | null;
  projected_profit: number | null;
  holding_months: number | null;
  purchase_price: number | null;
  acquisition_costs: number | null;
  financing_costs: number | null;
  selling_costs: number | null;
}

export async function loadCalibrationForOrg(orgId: string, baselineRehabPerSqft = 40): Promise<CalibrationPackage> {
  const admin = createAdminClient();

  const { data: deals } = await admin
    .from("deals")
    .select("*")
    .eq("org_id", orgId)
    .eq("stage", "Closed");

  const dealList = (deals ?? []) as Array<{
    id: string;
    address: string;
    sqft: number | null;
    final_sale_price: number | null;
    created_at: string;
    stage_changed_at: string | null;
  }>;
  const dealIds = dealList.map((d) => d.id);

  const [{ data: uws }, { data: rehabItems }] = await Promise.all([
    dealIds.length > 0
      ? admin
          .from("underwriting")
          .select("deal_id, arv, rehab_estimate, projected_profit, holding_months, purchase_price, acquisition_costs, financing_costs, selling_costs")
          .in("deal_id", dealIds)
      : Promise.resolve({ data: null, error: null }),
    admin.from("rehab_items").select("deal_id, actual_cost").eq("org_id", orgId),
  ]);

  const rehabByDeal = new Map<string, number>();
  for (const i of (rehabItems ?? []) as Array<{ deal_id: string; actual_cost: number | null }>) {
    rehabByDeal.set(i.deal_id, (rehabByDeal.get(i.deal_id) ?? 0) + (Number(i.actual_cost) || 0));
  }

  const uwById = new Map<string, UnderwritingRow>();
  for (const u of (uws ?? []) as UnderwritingRow[]) uwById.set(u.deal_id, u);

  const inputs: CalibrationDealInput[] = dealList
    .filter((d) => Number(d.final_sale_price) > 0)
    .map((d) => {
      const uw = uwById.get(d.id);
      // Realized profit must match the dashboard: same inputs, same computeDealPnl.
      const pnl = computeDealPnl({
        stage: "Closed",
        finalSalePrice: Number(d.final_sale_price),
        purchasePrice: uw?.purchase_price != null ? Number(uw.purchase_price) : null,
        acquisitionCosts: uw?.acquisition_costs != null ? Number(uw.acquisition_costs) : null,
        rehabActual: rehabByDeal.get(d.id) ?? null,
        financingCosts: uw?.financing_costs != null ? Number(uw.financing_costs) : null,
        sellingCosts: uw?.selling_costs != null ? Number(uw.selling_costs) : null,
      });
      const cycleDays =
        d.created_at && d.stage_changed_at
          ? Math.max(0, Math.floor((new Date(d.stage_changed_at).getTime() - new Date(d.created_at).getTime()) / 86_400_000))
          : null;

      return {
        id: d.id,
        address: d.address,
        sqft: Number(d.sqft) > 0 ? Number(d.sqft) : null,
        finalSalePrice: Number(d.final_sale_price),
        projectedArv: uw?.arv != null ? Number(uw.arv) : null,
        projectedRehab: uw?.rehab_estimate != null ? Number(uw.rehab_estimate) : null,
        projectedProfit: uw?.projected_profit != null ? Number(uw.projected_profit) : null,
        projectedHoldMonths: uw?.holding_months != null ? Number(uw.holding_months) : null,
        actualRehab: rehabByDeal.get(d.id) ?? null,
        realizedProfit: pnl.isRealized ? pnl.realizedProfit : null,
        actualHoldMonths: cycleDays != null ? Math.max(1, Math.round(cycleDays / 30)) : null,
      } as CalibrationDealInput;
    });

  const { deals: rows, market } = computeCalibration(inputs, baselineRehabPerSqft);
  return { deals: rows, market, baselineRehabPerSqft };
}
