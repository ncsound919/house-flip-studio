"use client";

import { useEffect, useState } from "react";
import type { RehabBudget } from "@/lib/finance/rehabBudget";
import type { ContractorScorecard } from "@/lib/finance/contractorScorecard";

const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const STATUS_STYLES: Record<RehabBudget["status"], string> = {
  on_track: "bg-emerald-50 text-emerald-700",
  at_risk: "bg-amber-50 text-amber-700",
  over_budget: "bg-red-50 text-red-700",
};

const STATUS_LABELS: Record<RehabBudget["status"], string> = {
  on_track: "On track",
  at_risk: "At risk",
  over_budget: "Over budget",
};

const RATING_STYLES: Record<ContractorScorecard["rating"], string> = {
  reliable: "bg-emerald-50 text-emerald-700",
  average: "bg-zinc-100 text-zinc-600",
  at_risk: "bg-red-50 text-red-700",
};

interface RehabDeal {
  deal: { id: string; address: string; city: string | null; stage: string };
  budget: RehabBudget;
  draws: { recorded: number; approved: number; paid: number };
}

interface RehabControlData {
  deals: RehabDeal[];
  totals: { committed: number; actual: number; projected: number; variance: number; atRisk: number; overBudget: number };
  contractors: ContractorScorecard[];
}

export default function RehabControlRoom() {
  const [data, setData] = useState<RehabControlData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/finance/rehab-control");
        if (!res.ok) throw new Error("Failed to load rehab control");
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Loading rehab control…</p>;
  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!data) return null;

  const t = data.totals;
  const summary = [
    ["Active rehabs", String(data.deals.length)],
    ["Committed", money(t.committed)],
    ["Actual spent", money(t.actual)],
    ["Projected total", money(t.projected)],
    ["Projected variance", money(t.variance)],
    ["At risk / over", `${t.atRisk} / ${t.overBudget}`],
  ];

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className={`mt-1 text-lg font-semibold ${label === "Projected variance" ? (t.variance > 0 ? "text-red-700" : "text-emerald-700") : "text-zinc-900"}`}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-zinc-900">Active rehabs</h2>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {data.deals.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-400">
            No rehab deals yet. Line items + change orders on a Rehab deal appear here automatically.
          </p>
        ) : (
          data.deals.map((entry, i) => {
            const b = entry.budget;
            const isOpen = expanded === entry.deal.id;
            return (
              <div key={entry.deal.id} className={i > 0 ? "border-t border-zinc-100" : ""}>
                <button
                  onClick={() => setExpanded(isOpen ? null : entry.deal.id)}
                  className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{entry.deal.address}</p>
                    <p className="text-xs text-zinc-500">
                      {entry.deal.stage} · {b.lineItems} line items · {b.overBudgetTrades.length > 0 ? `${b.overBudgetTrades.length} trade${b.overBudgetTrades.length === 1 ? "" : "s"} over` : "no trades over"}
                    </p>
                  </div>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status]}`}>{STATUS_LABELS[b.status]}</span>
                  <div className="hidden text-right sm:block">
                    <p className="text-sm font-semibold text-zinc-900">{money(b.projectedTotal)}</p>
                    <p className={`text-xs ${b.variance > 0 ? "text-red-600" : "text-emerald-600"}`}>
                      {b.variance > 0 ? `+${money(b.variance)}` : money(b.variance)}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-400">{isOpen ? "Close" : "Open"}</span>
                </button>
                {isOpen ? (
                  <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-4">
                    <div className="grid gap-3 sm:grid-cols-5">
                      {[
                        ["Estimate", money(b.originalEstimate)],
                        ["Committed", money(b.committed)],
                        ["Actual", money(b.actualSpend)],
                        ["Change orders", money(b.approvedChangeOrders)],
                        ["Remaining", money(b.remainingToCommit)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-zinc-200 bg-white p-3">
                          <p className="text-xs text-zinc-500">{label}</p>
                          <p className="mt-0.5 text-sm font-semibold text-zinc-900">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-zinc-200 bg-white p-3">
                        <p className="text-xs text-zinc-500">Draws (recorded / approved / paid)</p>
                        <p className="mt-0.5 text-sm font-semibold text-zinc-900">
                          {money(entry.draws.recorded)} / {money(entry.draws.approved)} / {money(entry.draws.paid)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-zinc-200 bg-white p-3 sm:col-span-2">
                        <p className="text-xs text-zinc-500">Trades over estimate</p>
                        {b.overBudgetTrades.length === 0 ? (
                          <p className="mt-0.5 text-sm text-zinc-500">None</p>
                        ) : (
                          <ul className="mt-0.5 space-y-0.5">
                            {b.overBudgetTrades.map((tr) => (
                              <li key={tr.trade} className="text-sm text-red-700">
                                {tr.trade} +{money(tr.variance)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-zinc-900">
        Contractor scorecards
        <span className="ml-2 text-xs font-normal text-zinc-400">from real bids vs actuals</span>
      </h2>
      {data.contractors.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400">
          No contractor work recorded yet. Assign contractors to rehab items to build scorecards.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="px-3 py-2">Contractor</th>
                <th className="px-3 py-2">Trade</th>
                <th className="px-3 py-2 text-right">Bid total</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Variance</th>
                <th className="px-3 py-2 text-right">Change orders</th>
                <th className="px-3 py-2 text-right">Completed</th>
                <th className="px-3 py-2">Rating</th>
              </tr>
            </thead>
            <tbody>
              {data.contractors.map((c) => (
                <tr key={c.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-zinc-900">{c.name}</td>
                  <td className="px-3 py-2 text-zinc-600">{c.trade ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-zinc-900">{money(c.bidTotal)}</td>
                  <td className="px-3 py-2 text-right text-zinc-900">{money(c.actualTotal)}</td>
                  <td className={`px-3 py-2 text-right ${c.variancePct != null && c.variancePct > 0 ? "text-red-700" : "text-emerald-700"}`}>
                    {c.variancePct != null ? `${c.variancePct}%` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600">{c.changeOrderCount}</td>
                  <td className="px-3 py-2 text-right text-zinc-600">{c.completedItems}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${RATING_STYLES[c.rating]}`}>
                      {c.rating}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
