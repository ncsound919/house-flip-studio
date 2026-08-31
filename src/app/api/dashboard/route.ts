import { NextResponse } from "next/server";
import { createAdminClient, requireOrgId } from "@/lib/apiHelpers";
import { DEAL_STAGES, type Deal } from "@/lib/types";
import { computeDealPnl } from "@/lib/finance/pnl";
import {
  computePortfolioMetrics,
  type PortfolioDealPnl,
} from "@/lib/finance/portfolio";

// Command-center aggregation: what the app knows WITHOUT the user asking.
// Returns auto-scored leads, red flags, and a deterministic "do this today"
// queue derived from real state. No LLM — all rule-based.

const STAGE_DAYS: Record<string, number> = {
  Lead: 7,
  Inspecting: 7,
  Underwriting: 7,
  "Offer Made": 10,
  "Under Contract": 21,
  Rehab: 45,
  Listed: 30,
  Closed: 999,
};

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

export async function GET() {
  try {
    const { orgId } = await requireOrgId();
    const admin = createAdminClient();

    const [{ data: deals }, { data: documents }, { data: contractors }, { data: rehabItems }] =
      await Promise.all([
        admin.from("deals").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        admin
          .from("documents")
          .select("*, deals(address, stage, org_id), rehab_items(description)")
          .eq("org_id", orgId),
        admin.from("contractors").select("*").eq("org_id", orgId),
        admin.from("rehab_items").select("*").eq("org_id", orgId),
      ]);

    const dealList = (deals ?? []) as Deal[];
    const flags: string[] = [];
    const actions: { id: string; kind: string; title: string; detail: string; dealId?: string; contractorId?: string }[] = [];

    // 1. Auto-score every open deal with enough data (deterministic, no LLM).
    const scoredDeals = dealList.map((d) => {
      let attentionScore: number | null = null;
      if (d.asking_price != null && d.sqft != null && d.sqft > 0) {
        const median = 185;
        const ppsf = d.asking_price / d.sqft;
        const ratio = ppsf / median;
        attentionScore = Math.round(
          Math.min(100, Math.max(0, 50 + (ratio <= 0.95 ? 25 : ratio >= 1.3 ? -20 : ratio >= 1.1 ? -8 : 0)))
        );
      }
      return { ...d, attentionScore };
    });

    // 2. Red flags — deals stuck in a stage too long.
    for (const d of dealList) {
      const max = STAGE_DAYS[d.stage] ?? 7;
      const inStage = daysSince(d.stage_changed_at || d.created_at);
      if (inStage > max && d.stage !== "Closed") {
        flags.push(`${d.address} has been in "${d.stage}" for ${inStage} days (threshold ${max})`);
        actions.push({
          id: `deal-stuck-${d.id}`,
          kind: "deal",
          title: `Move "${d.address}" forward`,
          detail: `Stuck in ${d.stage} for ${inStage} days. Next step: advance stage or add notes.`,
          dealId: d.id,
        });
      }
    }

    // 3. Red flags — overdue documents (requested >7 days, still not received).
    for (const doc of documents ?? []) {
      const dealsRef = doc.deals as { address?: string; org_id?: string } | null;
      if (doc.status === "received" || doc.status === "filed") continue;
      if (dealsRef && dealsRef.org_id !== orgId) continue;
      if (!doc.requested_at) continue;
      const requested = new Date(doc.requested_at + "T00:00:00");
      const deadline = new Date(requested);
      deadline.setDate(deadline.getDate() + 7);
      if (deadline.getTime() < Date.now() && doc.status !== "received" && doc.status !== "filed") {
        const docLabel = doc.doc_type.replace(/_/g, " ");
        const itemDesc = (doc.rehab_items as { description?: string } | null)?.description;
        flags.push(`Overdue document: ${docLabel}${itemDesc ? ` for "${itemDesc}"` : ""}${dealsRef?.address ? ` at ${dealsRef.address}` : ""}`);
        actions.push({
          id: `doc-${doc.id}`,
          kind: "document",
          title: `Follow up on ${docLabel}`,
          detail: itemDesc ? `"${itemDesc}" requested ${doc.requested_at} — still ${doc.status}.` : `Requested ${doc.requested_at} — still ${doc.status}.`,
        });
      }
    }

    // 4. Red flags — contractor insurance expiring within 30 days.
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    for (const c of contractors ?? []) {
      if (c.insurance_expiry) {
        const expiry = new Date(String(c.insurance_expiry) + "T00:00:00");
        if (expiry.getTime() < in30.getTime() && expiry.getTime() > Date.now()) {
          flags.push(`Insurance expires ${c.insurance_expiry} for contractor ${c.name}`);
          actions.push({
            id: `ins-${c.id}`,
            kind: "contractor",
            title: `Get updated insurance from ${c.name}`,
            detail: `Policy expires ${c.insurance_expiry}.`,
            contractorId: c.id,
          });
        }
      }
    }

    // 5. Rehab items over budget (actual > estimated).
    for (const item of rehabItems ?? []) {
      if ((item.actual_cost ?? 0) > (item.estimated_cost ?? 0) && item.status !== "completed") {
        const deal = dealList.find((d) => d.id === item.deal_id);
        flags.push(`Over budget: "${item.description}" (${item.estimated_cost ?? 0} est vs ${item.actual_cost} actual)${deal ? ` at ${deal.address}` : ""}`);
      }
    }

    // --- Business pulse KPIs (deterministic, no LLM) ---
    const dealIds = dealList.map((d) => d.id);
    const [
      { data: uws },
      { data: lastRun },
      { count: pendingCount },
      { count: autoApprovedCount },
      { count: blockedCount },
    ] = await Promise.all([
      dealIds.length > 0
        ? admin
            .from("underwriting")
            .select(
              "deal_id, arv, projected_profit, purchase_price, acquisition_costs, financing_costs, selling_costs"
            )
            .in("deal_id", dealIds)
        : Promise.resolve({ data: null, error: null }),
      admin
        .from("agent_runs")
        .select("status, started_at, finished_at")
        .eq("org_id", orgId)
        .order("started_at", { ascending: false })
        .limit(1),
      admin
        .from("agent_actions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "pending_approval"),
      admin
        .from("agent_actions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "auto_approved"),
      admin
        .from("agent_actions")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("status", "blocked"),
    ]);

    const openUws = (uws ?? []) as Array<{ deal_id: string; arv: number | null; projected_profit: number | null }>;
    const openIds = new Set(dealList.filter((d) => d.stage !== "Closed").map((d) => d.id));
    const orgUws = openUws.filter((u) => openIds.has(u.deal_id));
    const projectedProfitSum = orgUws.reduce((s, u) => s + (Number(u.projected_profit) || 0), 0);
    const arvSum = orgUws.reduce((s, u) => s + (Number(u.arv) || 0), 0);

    // Lead tier counts parsed from the deterministic notes the hunt wrote.
    const tiers = { hot: 0, warm: 0, cold: 0 };
    for (const d of dealList) {
      const notes = String((d as Deal & { notes?: string }).notes ?? "");
      if (notes.includes("Tier: HOT LEAD")) tiers.hot++;
      else if (notes.includes("Tier: WARM LEAD")) tiers.warm++;
      else if (notes.includes("Tier: COLD LEAD")) tiers.cold++;
    }

    // Average dwell per stage across open deals (how long things sit).
    const dwellByStage: Record<string, { total: number; count: number }> = {};
    for (const d of dealList) {
      if (d.stage === "Closed") continue;
      const t = dwellByStage[d.stage] ?? { total: 0, count: 0 };
      t.total += daysSince(d.stage_changed_at || d.created_at);
      t.count += 1;
      dwellByStage[d.stage] = t;
    }
    const avgStageDwell = Object.entries(dwellByStage)
      .filter(([, v]) => v.count > 0)
      .map(([stage, v]) => ({ stage, avgDays: Math.round(v.total / v.count) }));

    const run = (lastRun?.[0] as { status?: string; started_at?: string } | undefined) ?? null;
    const kpis = {
      projectedProfitSum,
      arvSum,
      tiers,
      avgStageDwell,
      moneyGatesAwaiting: pendingCount ?? 0,
      autoApproved: autoApprovedCount ?? 0,
      blockedCount: blockedCount ?? 0,
      lastAgentRun: run
        ? { status: run.status ?? "unknown", started_at: run.started_at ?? null }
        : null,
    };

    // --- Finance KPIs (deterministic, labeled real vs projected) ---
    // Realized P&L only from Closed deals with an actual sale price; everything
    // else is projected from underwriting rows and labeled as such.
    interface UnderwritingRow {
      deal_id: string;
      arv: number | null;
      projected_profit: number | null;
      purchase_price: number | null;
      acquisition_costs: number | null;
      financing_costs: number | null;
      selling_costs: number | null;
    }

    const uwById = new Map<string, UnderwritingRow>();
    for (const u of (uws ?? []) as UnderwritingRow[]) uwById.set(u.deal_id, u);

    const rehabActualByDeal = new Map<string, number>();
    for (const item of rehabItems ?? []) {
      rehabActualByDeal.set(
        item.deal_id,
        (rehabActualByDeal.get(item.deal_id) ?? 0) + (Number(item.actual_cost) || 0)
      );
    }

    const pnlFor = (d: Deal): PortfolioDealPnl => {
      const uw = uwById.get(d.id);
      const finalSalePrice = (d as Deal & { final_sale_price?: number | null }).final_sale_price;
      const pnl = computeDealPnl({
        stage: d.stage,
        finalSalePrice: Number(finalSalePrice) > 0 ? Number(finalSalePrice) : null,
        purchasePrice: uw?.purchase_price ?? null,
        acquisitionCosts: uw?.acquisition_costs ?? null,
        rehabActual: rehabActualByDeal.get(d.id) ?? null,
        financingCosts: uw?.financing_costs ?? null,
        sellingCosts: uw?.selling_costs ?? null,
        projectedProfit: uw?.projected_profit ?? null,
        projectedArv: uw?.arv ?? null,
      });
      return {
        isRealized: pnl.isRealized,
        realizedProfit: pnl.realizedProfit,
        finalSalePrice: pnl.finalSalePrice,
        projectedProfit: pnl.projectedProfit,
      };
    };

    const pnls: Record<string, PortfolioDealPnl> = {};
    for (const d of dealList) pnls[d.id] = pnlFor(d);

    const finance = computePortfolioMetrics({
      deals: dealList.map((d) => ({
        id: d.id,
        stage: d.stage,
        createdAt: d.created_at,
        stageChangedAt: d.stage_changed_at || d.created_at,
      })),
      pnls,
    });

    // ROI on invested capital — only over realized deals with a real cost basis.
    let investedCapital = 0;
    let realizedProfitOnCapital = 0;
    for (const d of dealList) {
      if (d.stage !== "Closed" || !pnls[d.id]?.isRealized) continue;
      const purchase = Number(uwById.get(d.id)?.purchase_price);
      if (!(purchase > 0)) continue;
      investedCapital += purchase;
      realizedProfitOnCapital += pnls[d.id].realizedProfit ?? 0;
    }
    const roi =
      investedCapital > 0
        ? Math.round((realizedProfitOnCapital / investedCapital) * 100)
        : null;

    // Cash flow: `in` = real closed sale prices, `out` = real payments ledger.
    // The payments table is Phase 3 and does NOT exist in this branch — the query
    // degrades to zero (never fabricating spend) and flags that it's unavailable.
    let paymentsData: Array<{ deal_id: string | null; amount: number | null; created_at: string }> = [];
    let paymentsUnavailable = false;
    try {
      const { data, error } = await admin
        .from("payments")
        .select("deal_id, amount, created_at")
        .eq("org_id", orgId);
      if (error) paymentsUnavailable = true;
      else paymentsData = (data ?? []) as typeof paymentsData;
    } catch {
      paymentsUnavailable = true;
    }

    const monthKey = (iso: string) => (iso || "").slice(0, 7);
    const cashFlowMap = new Map<string, { month: string; in: number; out: number }>();
    for (const d of dealList) {
      if (d.stage !== "Closed") continue;
      const sale = Number((d as Deal & { final_sale_price?: number | null }).final_sale_price);
      if (!(sale > 0)) continue;
      const key = monthKey(d.stage_changed_at || d.created_at);
      const bucket = cashFlowMap.get(key) ?? { month: key, in: 0, out: 0 };
      bucket.in += sale;
      cashFlowMap.set(key, bucket);
    }
    for (const p of paymentsData) {
      const key = monthKey(p.created_at);
      if (!key) continue;
      const bucket = cashFlowMap.get(key) ?? { month: key, in: 0, out: 0 };
      bucket.out += Number(p.amount) || 0;
      cashFlowMap.set(key, bucket);
    }
    const cashFlow = [...cashFlowMap.values()].sort((a, b) => a.month.localeCompare(b.month));

    // Hit rate: real offers sent → closed. This branch's planner records offers as
    // advance_stage actions targeting "Offer Made"; no send_offer kind exists here.
    let offersSent = 0;
    try {
      const { data, error } = await admin
        .from("agent_actions")
        .select("action_type, status, metadata")
        .eq("org_id", orgId)
        .eq("action_type", "advance_stage")
        .in("status", ["done", "approved", "auto_approved"]);
      if (!error) {
        offersSent = (data ?? []).filter(
          (a) => (a.metadata as { to?: string } | null)?.to === "Offer Made"
        ).length;
      }
    } catch {
      offersSent = 0;
    }
    const closedCount = dealList.filter((d) => d.stage === "Closed").length;
    const hitRate = offersSent > 0 ? Math.round((closedCount / offersSent) * 100) : null;

    // 6. Red flag: money gates piling up unapproved.
    if ((pendingCount ?? 0) > 0) {
      flags.push(
        `${pendingCount} money-gate action${pendingCount === 1 ? "" : "s"} awaiting your approval in the Flip operator pane.`
      );
    }

    const topLeads = scoredDeals
      .filter((d) => d.attentionScore != null)
      .sort((a, b) => (b.attentionScore ?? 0) - (a.attentionScore ?? 0))
      .slice(0, 5);

    const newLeads = dealList.filter((d) => d.stage === "Lead").length;

    return NextResponse.json({
      counts: {
        totalDeals: dealList.length,
        openDeals: dealList.filter((d) => d.stage !== "Closed").length,
        newLeads,
        flags: flags.length,
        actions: actions.length,
        overdueDocs: (documents ?? []).filter((d) => d.status === "missing" || d.status === "requested").length,
      },
      kpis,
      finance: {
        realizedProfit: finance.realizedProfit,
        realizedCount: finance.realizedCount,
        pipelineValue: finance.pipelineValue,
        averageCycleDays: finance.averageCycleDays,
        openDealCount: finance.openDealCount,
        roi,
      },
      cashFlow,
      hitRate: { rate: hitRate, sampleSize: offersSent, closed: closedCount },
      paymentsUnavailable,
      flags: flags.slice(0, 15),
      actions: actions.slice(0, 10),
      topLeads,
      stages: DEAL_STAGES.map((s) => ({
        stage: s,
        count: dealList.filter((d) => d.stage === s).length,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unauthorized";
    return NextResponse.json(
      { error: message },
      { status: message === "Unauthorized" ? 401 : 500 }
    );
  }
}
