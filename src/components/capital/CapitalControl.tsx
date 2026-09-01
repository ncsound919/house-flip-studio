"use client";

import { useEffect, useState } from "react";
import type { FundTotals } from "@/lib/finance/fund";
import type { StackLayer, WaterfallResult } from "@/lib/finance/waterfall";
import type { Deal } from "@/lib/types";

const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const KIND_LABELS: Record<StackLayer["kind"], string> = {
  debt: "Senior debt",
  partner: "Partner capital",
  equity: "Operator equity",
};

const KIND_STYLES: Record<StackLayer["kind"], string> = {
  debt: "bg-blue-50 text-blue-700",
  partner: "bg-violet-50 text-violet-700",
  equity: "bg-zinc-100 text-zinc-700",
};

interface DealStack {
  deal: { id: string; address: string; city: string | null; stage: string };
  stack: StackLayer[];
  totalCapital: number;
  waterfall: WaterfallResult | null;
  waterfallLabel: "realized" | "projected" | null;
}

interface CapitalData {
  totals: FundTotals;
  deals: DealStack[];
}

export default function CapitalControl() {
  const [data, setData] = useState<CapitalData | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const fetchAll = async () => {
    try {
      const [capRes, dealRes] = await Promise.all([fetch("/api/finance/capital"), fetch("/api/deals")]);
      if (!capRes.ok || !dealRes.ok) throw new Error("Failed to load capital");
      setData(await capRes.json());
      const dl = await dealRes.json();
      setDeals(dl.deals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Loading capital…</p>;
  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!data) return null;

  const t = data.totals;
  const cards = [
    ["Capital deployed", money(t.capitalDeployed)],
    ["Operator equity", money(t.operatorEquity)],
    ["Partner capital", money(t.partnerCapital)],
    ["Senior debt", money(t.totalDebt)],
    ["Partner share", `${t.partnerShareOfDeployed}%`],
    ["Active deals", String(t.activeDeals)],
  ];

  return (
    <div>
      {error ? null : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          How every deal is funded, and what each capital layer earns on exit. Realized waterfalls come only from closed
          deals with a recorded sale price; open deals are labeled projected.
        </p>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
        >
          + Add capital
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {data.deals.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-400">
            No capital stacks yet. Add how a deal is funded (equity, partner capital, or link debt via the Debt
            Schedule) to see the waterfall.
          </p>
        ) : (
          data.deals.map((entry, i) => {
            const w = entry.waterfall;
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
                      {entry.deal.stage} · {entry.stack.length} layer{entry.stack.length === 1 ? "" : "s"} · {money(entry.totalCapital)}
                    </p>
                  </div>
                  {w ? (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${w.operatorResidual >= 0 && !w.isDeficit ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                      {entry.waterfallLabel} return {money(w.operatorResidual)}
                    </span>
                  ) : null}
                  <span className="text-xs text-zinc-400">{isOpen ? "Close" : "Open"}</span>
                </button>
                {isOpen ? (
                  <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-4">
                    <div className="mb-3 grid gap-3 sm:grid-cols-4">
                      {[
                        ["Total capital", money(entry.totalCapital)],
                        ["Net proceeds", w ? money(w.totalSeniorPayout + w.operatorResidual) : "—"],
                        ["Senior payout", w ? money(w.totalSeniorPayout) : "—"],
                        ["Operator result", w ? money(w.operatorResidual) : "—"],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-lg border border-zinc-200 bg-white p-3">
                          <p className="text-xs text-zinc-500">{label}</p>
                          <p className={`mt-0.5 text-sm font-semibold ${label === "Operator result" && w && w.operatorResidual < 0 ? "text-red-700" : "text-zinc-900"}`}>
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>
                    {w?.isDeficit ? (
                      <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs font-medium text-red-700">
                        Shortfall: senior layers are not fully repaid at this exit.
                      </p>
                    ) : null}
                    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                            <th className="px-3 py-2">Layer</th>
                            <th className="px-3 py-2">Name</th>
                            <th className="px-3 py-2 text-right">Principal</th>
                            <th className="px-3 py-2 text-right">Rate</th>
                            <th className="px-3 py-2 text-right">Payout</th>
                            <th className="px-3 py-2 text-right">Return</th>
                            <th className="px-3 py-2 text-right">ROI</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.stack.map((l) => {
                            const res = w?.layers.find((x) => x.name === l.name && x.kind === l.kind);
                            return (
                              <tr key={`${l.kind}-${l.name}`} className="border-b border-zinc-100 last:border-0">
                                <td className="px-3 py-2">
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${KIND_STYLES[l.kind]}`}>
                                    {KIND_LABELS[l.kind]}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-medium text-zinc-900">{l.name}</td>
                                <td className="px-3 py-2 text-right text-zinc-900">{money(l.principal)}</td>
                                <td className="px-3 py-2 text-right text-zinc-600">
                                  {l.kind === "equity" || !l.annualRate ? "—" : `${l.annualRate}%`}
                                </td>
                                <td className="px-3 py-2 text-right text-zinc-900">{money(res?.payout)}</td>
                                <td className={`px-3 py-2 text-right font-medium ${(res?.returnAmt ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                                  {money(res?.returnAmt)}
                                </td>
                                <td className="px-3 py-2 text-right text-zinc-600">{res?.roiPct != null ? `${res.roiPct}%` : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {showAdd ? (
        <AddCapitalForm
          deals={deals}
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            setLoading(true);
            fetchAll();
          }}
        />
      ) : null}
    </div>
  );
}

function AddCapitalForm({ deals, onClose, onSaved }: { deals: Deal[]; onClose: () => void; onSaved: () => void }) {
  const [dealId, setDealId] = useState(deals[0]?.id ?? "");
  const [sourceType, setSourceType] = useState<"operator_equity" | "partner_capital">("operator_equity");
  const [sourceName, setSourceName] = useState("");
  const [amount, setAmount] = useState("");
  const [annualRate, setAnnualRate] = useState("");
  const [status, setStatus] = useState("active");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/finance/capital", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: dealId,
          source_type: sourceType,
          source_name: sourceName,
          amount: Number(amount) || 0,
          annual_rate: Number(annualRate) || 0,
          status,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || "Failed to add");
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-zinc-900">Add capital</h3>
        {error ? <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p> : null}
        <form onSubmit={submit} className="mt-3 space-y-2">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Deal</span>
            <select
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
            >
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.address}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Source</span>
            <select
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
            >
              <option value="operator_equity">Operator equity</option>
              <option value="partner_capital">Partner capital</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Source name</span>
            <input
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder={sourceType === "partner_capital" ? "Investor name" : "Self"}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">Amount ($)</span>
              <input
                type="number"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">Annual rate %</span>
              <input
                type="number"
                step="0.1"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                value={annualRate}
                onChange={(e) => setAnnualRate(e.target.value)}
                placeholder="preferred return"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
              {submitting ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
