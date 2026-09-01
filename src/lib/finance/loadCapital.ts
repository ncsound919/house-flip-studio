// Capital loader — assembles fund totals + per-deal capital stacks with
// waterfalls from real rows. Realized waterfalls come only from closed deals
// with a recorded sale price; open deals get a labeled projected waterfall.

import { createAdminClient } from "@/lib/apiHelpers";
import { computeWaterfall, type StackLayer, type WaterfallResult } from "./waterfall";
import { computeFundTotals, type FundTotals } from "./fund";

export interface CapitalContribution {
  id: string;
  deal_id: string;
  source_type: "operator_equity" | "partner_capital";
  source_name: string;
  amount: number;
  annual_rate: number;
  priority: number;
  status: string;
  funded_at: string | null;
}

interface DebtRow {
  id: string;
  lender: string;
  balance: number;
  interest_rate: number | null;
  collateral_deal_id: string | null;
}

interface DealRow {
  id: string;
  address: string;
  city: string | null;
  stage: string;
  asking_price: number | null;
  final_sale_price: number | null;
  arv_estimate: number | null;
  created_at: string;
  stage_changed_at: string | null;
}

interface UnderwritingRow {
  deal_id: string;
  selling_costs: number | null;
  arv: number | null;
  holding_months: number | null;
}

export interface DealStackView {
  deal: { id: string; address: string; city: string | null; stage: string };
  stack: StackLayer[];
  totalCapital: number;
  waterfall: WaterfallResult | null;
  waterfallLabel: "realized" | "projected" | null;
}

export interface CapitalPackage {
  totals: FundTotals;
  deals: DealStackView[];
}

const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));

export async function loadCapitalForOrg(orgId: string): Promise<CapitalPackage> {
  const admin = createAdminClient();

  const [
    { data: deals },
    { data: contributions },
    { data: debts },
    { data: uws },
    { data: rehabItems },
  ] = await Promise.all([
    admin.from("deals").select("*").eq("org_id", orgId),
    admin.from("capital_contributions").select("*").eq("org_id", orgId),
    admin.from("debts").select("id, lender, balance, interest_rate, collateral_deal_id").eq("org_id", orgId),
    admin.from("underwriting").select("deal_id, selling_costs, arv, holding_months"),
    admin.from("rehab_items").select("deal_id, actual_cost").eq("org_id", orgId),
  ]);

  const dealList = (deals ?? []) as DealRow[];
  const contributionList = (contributions ?? []) as CapitalContribution[];
  const debtList = (debts ?? []) as DebtRow[];
  const uwById = new Map<string, UnderwritingRow>();
  for (const u of (uws ?? []) as UnderwritingRow[]) uwById.set(u.deal_id, u);

  const activeContributions = contributionList.filter((c) => c.status === "active");
  const activeDebts = debtList.filter((d) => Number(d.balance) > 0);

  const totals = computeFundTotals(
    activeContributions.map((c) => ({ source_type: c.source_type, amount: c.amount, status: c.status })),
    activeDebts.map((d) => ({ balance: d.balance })),
    dealList.map((d) => ({ stage: d.stage }))
  );

  const stackByDeal = new Map<string, StackLayer[]>();
  for (const d of activeDebts) {
    if (!d.collateral_deal_id) continue;
    const list = stackByDeal.get(d.collateral_deal_id) ?? [];
    list.push({ kind: "debt", name: d.lender, principal: Number(d.balance) || 0, annualRate: Number(d.interest_rate) || 0, priority: 0 });
    stackByDeal.set(d.collateral_deal_id, list);
  }
  for (const c of activeContributions) {
    const list = stackByDeal.get(c.deal_id) ?? [];
    const kind = c.source_type === "partner_capital" ? "partner" : "equity";
    list.push({
      kind,
      name: c.source_name,
      principal: Number(c.amount) || 0,
      annualRate: Number(c.annual_rate) || 0,
      priority: kind === "equity" ? 99 : c.priority,
    });
    stackByDeal.set(c.deal_id, list);
  }

  const rehabByDeal = new Map<string, number>();
  for (const i of (rehabItems ?? []) as Array<{ deal_id: string; actual_cost: number | null }>) {
    rehabByDeal.set(i.deal_id, (rehabByDeal.get(i.deal_id) ?? 0) + (Number(i.actual_cost) || 0));
  }

  const dealStacks: DealStackView[] = [];
  for (const d of dealList) {
    const stack = stackByDeal.get(d.id);
    if (!stack || stack.length === 0) continue;
    const uw = uwById.get(d.id);
    const totalCapital = stack.reduce((s, l) => s + l.principal, 0);

    // Exit value: realized (closed + sale price) or projected (ARV/asking).
    const realized =
      d.stage === "Closed" && Number(d.final_sale_price) > 0 ? Number(d.final_sale_price) : null;
    const exitValue = realized ?? (Number(d.arv_estimate) || Number(d.asking_price) || null);

    let waterfall: WaterfallResult | null = null;
    let label: "realized" | "projected" | null = null;
    if (exitValue != null && exitValue > 0) {
      const sellingCosts = Number(uw?.selling_costs) || exitValue * 0.08;
      const netProceeds = exitValue - sellingCosts;
      const monthsHeld = realized
        ? Math.max(1, Math.round(daysBetween(d.created_at, d.stage_changed_at ?? d.created_at) / 30))
        : Number(uw?.holding_months) || 6;
      waterfall = computeWaterfall({ layers: stack, exitProceeds: netProceeds, monthsHeld });
      label = realized ? "realized" : "projected";
    }

    dealStacks.push({
      deal: { id: d.id, address: d.address, city: d.city, stage: d.stage },
      stack,
      totalCapital,
      waterfall,
      waterfallLabel: label,
    });
  }

  dealStacks.sort((a, b) => (a.waterfall?.operatorResidual ?? -Infinity) - (b.waterfall?.operatorResidual ?? -Infinity));

  return { totals, deals: dealStacks };
}
