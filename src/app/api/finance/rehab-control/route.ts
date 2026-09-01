import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { computeRehabBudget, type BudgetItem, type RehabBudget } from "@/lib/finance/rehabBudget";
import { computeContractorScorecards } from "@/lib/finance/contractorScorecard";

// Rehab control room — aggregate budget health across every active rehab.
// Pure computation over the real ledger (rehab_items, change_orders, payments).
// No new storage; deterministic and labeled (projected vs actual).

interface RehabItemRow {
  id: string;
  deal_id: string;
  trade: string;
  estimated_cost: number;
  actual_cost: number;
  status: string;
  contractor_id: string | null;
  contractors?: { name: string } | null;
}

interface ChangeOrderRow {
  id: string;
  rehab_item_id: string;
  cost_impact: number;
  status: string;
}

interface PaymentRow {
  id: string;
  deal_id: string;
  amount: number;
  status: string;
}

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();

    const [
      { data: deals },
      { data: items },
      { data: changeOrders },
      { data: payments },
    ] = await Promise.all([
      admin.from("deals").select("id, address, city, stage").eq("org_id", orgId),
      admin
        .from("rehab_items")
        .select("*, contractors(name)")
        .eq("org_id", orgId),
      admin.from("change_orders").select("*"),
      admin.from("payments").select("*").eq("org_id", orgId),
    ]);

    const dealList = (deals ?? []) as Array<{ id: string; address: string; city: string | null; stage: string }>;
    const itemList = (items ?? []) as RehabItemRow[];
    const coList = (changeOrders ?? []) as ChangeOrderRow[];
    const paymentList = (payments ?? []) as PaymentRow[];

    const itemsByDeal = new Map<string, RehabItemRow[]>();
    for (const i of itemList) {
      const list = itemsByDeal.get(i.deal_id) ?? [];
      list.push(i);
      itemsByDeal.set(i.deal_id, list);
    }
    const itemIds = new Set(itemList.map((i) => i.id));
    const coByItem = new Map<string, ChangeOrderRow[]>();
    for (const co of coList) {
      if (!itemIds.has(co.rehab_item_id)) continue;
      const list = coByItem.get(co.rehab_item_id) ?? [];
      list.push(co);
      coByItem.set(co.rehab_item_id, list);
    }

    // Only deals that actually have rehab items (or are in Rehab).
    const active = dealList
      .filter((d) => (itemsByDeal.get(d.id)?.length ?? 0) > 0 || d.stage === "Rehab")
      .map((d) => {
        const dealItems = itemsByDeal.get(d.id) ?? [];
        const budget = computeRehabBudget(
          dealItems.map((i): BudgetItem => ({
            id: i.id,
            trade: i.trade,
            status: i.status,
            estimated_cost: Number(i.estimated_cost) || 0,
            actual_cost: Number(i.actual_cost) || 0,
          })),
          dealItems.flatMap((i) => (coByItem.get(i.id) ?? []).map((co) => ({ rehab_item_id: i.id, status: co.status, cost_impact: co.cost_impact })))
        );
        const dealPayments = paymentList.filter((p) => p.deal_id === d.id);
        return {
          deal: { id: d.id, address: d.address, city: d.city, stage: d.stage },
          budget,
          draws: {
            recorded: dealPayments.reduce((s, p) => s + (p.status === "recorded" ? Number(p.amount) || 0 : 0), 0),
            approved: dealPayments.reduce((s, p) => s + (p.status === "approved" ? Number(p.amount) || 0 : 0), 0),
            paid: dealPayments.reduce((s, p) => s + (p.status === "paid" ? Number(p.amount) || 0 : 0), 0),
          },
        };
      })
      .sort((a, b) => b.budget.variance - a.budget.variance);

    const scorecards = computeContractorScorecards(
      itemList.map((i) => ({
        id: i.id,
        contractor_id: i.contractor_id,
        contractor_name: i.contractors?.name ?? null,
        trade: i.trade,
        status: i.status,
        estimated_cost: Number(i.estimated_cost) || 0,
        actual_cost: Number(i.actual_cost) || 0,
      })),
      coList.map((co) => ({ rehab_item_id: co.rehab_item_id, status: co.status, cost_impact: co.cost_impact }))
    );

    const totals: { committed: number; actual: number; projected: number; variance: number; atRisk: number; overBudget: number } = {
      committed: active.reduce((s, a) => s + a.budget.committed, 0),
      actual: active.reduce((s, a) => s + a.budget.actualSpend, 0),
      projected: active.reduce((s, a) => s + a.budget.projectedTotal, 0),
      variance: active.reduce((s, a) => s + a.budget.variance, 0),
      atRisk: active.filter((a) => a.budget.status === "at_risk").length,
      overBudget: active.filter((a) => a.budget.status === "over_budget").length,
    };

    return NextResponse.json({ deals: active, totals, contractors: scorecards });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: err instanceof Error && err.message === "Unauthorized" ? 401 : 500 }
    );
  }
}
