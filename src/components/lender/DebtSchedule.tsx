"use client";

import { useEffect, useState } from "react";
import { computeDebtTotals, DEBT_KINDS, type DebtKind, type DebtRow } from "@/lib/finance/debtSchedule";
import type { Deal } from "@/lib/types";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const KIND_LABELS: Record<DebtKind, string> = {
  heloc: "HELOC",
  hard_money: "Hard money",
  note: "Private note",
  construction: "Construction",
  credit_card: "Credit card",
  other: "Other",
};

const blank = { lender: "", kind: "other" as DebtKind, balance: "", interest_rate: "", monthly_payment: "", collateral_deal_id: "" };

export default function DebtSchedule() {
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);

  const fetchData = async () => {
    try {
      const [dRes, dealsRes] = await Promise.all([fetch("/api/finance/debts"), fetch("/api/deals")]);
      if (!dRes.ok || !dealsRes.ok) throw new Error("Failed to load debt schedule");
      const d = await dRes.json();
      const dl = await dealsRes.json();
      setDebts(d.debts);
      setDeals(dl.deals);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const addDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lender.trim()) return;
    try {
      const res = await fetch("/api/finance/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lender: form.lender,
          kind: form.kind,
          balance: Number(form.balance) || 0,
          interest_rate: form.interest_rate !== "" ? Number(form.interest_rate) : null,
          monthly_payment: form.monthly_payment !== "" ? Number(form.monthly_payment) : null,
          collateral_deal_id: form.collateral_deal_id || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to add debt");
      setForm(blank);
      setLoading(true);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add debt");
    }
  };

  const removeDebt = async (id: string) => {
    try {
      await fetch(`/api/finance/debts/${id}`, { method: "DELETE" });
      setLoading(true);
      await fetchData();
    } catch {
      // ignore
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading debt schedule…</p>;

  const totals = computeDebtTotals(debts);

  const cards = [
    ["Total debt", money(totals.totalBalance)],
    ["Weighted rate", totals.weightedRate != null ? `${totals.weightedRate}%` : "—"],
    ["Monthly obligations", money(totals.monthlyObligations)],
    ["Secured by property", `${totals.securedCount} / ${totals.count}`],
  ];

  return (
    <div>
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            {debts.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-400">
                No debts recorded. Log every HELOC, hard-money loan, and note — this is what a bank underwriter asks for.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                    <th className="px-3 py-2">Lender</th>
                    <th className="px-3 py-2">Kind</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Monthly</th>
                    <th className="px-3 py-2">Collateral</th>
                    <th className="px-3 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {debts.map((d) => (
                    <tr key={d.id} className="border-b border-zinc-100 last:border-0">
                      <td className="px-3 py-2 font-medium text-zinc-900">{d.lender}</td>
                      <td className="px-3 py-2 text-zinc-600">{KIND_LABELS[d.kind]}</td>
                      <td className="px-3 py-2 text-right text-zinc-900">{money(Number(d.balance))}</td>
                      <td className="px-3 py-2 text-right text-zinc-600">
                        {d.interest_rate != null ? `${d.interest_rate}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-600">
                        {d.monthly_payment != null ? money(Number(d.monthly_payment)) : "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-600">
                        {(d.deals as { address?: string } | null)?.address ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => removeDebt(d.id)} className="text-xs font-medium text-red-600 hover:text-red-700">
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <form onSubmit={addDebt} className="rounded-xl border border-zinc-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-zinc-900">Add debt</h3>
          <div className="mt-3 space-y-2">
            <input
              value={form.lender}
              onChange={(e) => setForm({ ...form, lender: e.target.value })}
              placeholder="Lender"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as DebtKind })}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            >
              {DEBT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABELS[k]}
                </option>
              ))}
            </select>
            <input
              value={form.balance}
              onChange={(e) => setForm({ ...form, balance: e.target.value })}
              placeholder="Balance"
              type="number"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <input
              value={form.interest_rate}
              onChange={(e) => setForm({ ...form, interest_rate: e.target.value })}
              placeholder="Interest rate %"
              type="number"
              step="0.1"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <input
              value={form.monthly_payment}
              onChange={(e) => setForm({ ...form, monthly_payment: e.target.value })}
              placeholder="Monthly payment"
              type="number"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <select
              value={form.collateral_deal_id}
              onChange={(e) => setForm({ ...form, collateral_deal_id: e.target.value })}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            >
              <option value="">No collateral (unsecured)</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.address}
                </option>
              ))}
            </select>
            <button type="submit" className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
