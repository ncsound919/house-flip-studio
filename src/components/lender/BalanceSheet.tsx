"use client";

import { useEffect, useState } from "react";
import { computeBalanceSheet, ACCOUNT_TYPES, type AccountRow, type AccountType } from "@/lib/finance/balanceSheet";
import type { DebtRow } from "@/lib/finance/debtSchedule";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  receivable: "Receivables",
  other_asset: "Other Assets",
  liability: "Liabilities",
  equity: "Equity",
};

const blank = { account_name: "", account_type: "cash" as AccountType, balance: "", as_of: "" };

export default function BalanceSheet() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(blank);

  const fetchData = async () => {
    try {
      const [aRes, dRes] = await Promise.all([fetch("/api/finance/accounts"), fetch("/api/finance/debts")]);
      if (!aRes.ok || !dRes.ok) throw new Error("Failed to load balance sheet data");
      const a = await aRes.json();
      const d = await dRes.json();
      setAccounts(a.accounts);
      setDebts(d.debts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.account_name.trim()) return;
    try {
      const res = await fetch("/api/finance/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_name: form.account_name,
          account_type: form.account_type,
          balance: Number(form.balance) || 0,
          as_of: form.as_of || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to add account");
      setForm(blank);
      setLoading(true);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add account");
    }
  };

  const removeAccount = async (id: string) => {
    try {
      await fetch(`/api/finance/accounts/${id}`, { method: "DELETE" });
      setLoading(true);
      await fetchData();
    } catch {
      // ignore
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading balance sheet…</p>;

  const sheet = computeBalanceSheet(accounts, debts.map((d) => ({ id: d.id, lender: d.lender, balance: d.balance })));

  return (
    <div>
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-zinc-900">Balance Sheet</h2>
              <p className="text-xs text-zinc-500">Equity is computed as the plug (assets − liabilities).</p>
            </div>
            <div className="space-y-3 px-4 py-4">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Assets</p>
                <div className="mt-1 space-y-1 text-sm">
                  <div className="flex justify-between text-zinc-600">
                    <span>Cash</span>
                    <span>{money(sheet.cash)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>Receivables</span>
                    <span>{money(sheet.receivables)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>Other assets</span>
                    <span>{money(sheet.otherAssets)}</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-100 pt-1 font-semibold text-zinc-900">
                    <span>Total assets</span>
                    <span>{money(sheet.totalAssets)}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Liabilities</p>
                <div className="mt-1 space-y-1 text-sm">
                  <div className="flex justify-between text-zinc-600">
                    <span>Debt schedule (real loans)</span>
                    <span>{money(sheet.scheduleDebt)}</span>
                  </div>
                  <div className="flex justify-between text-zinc-600">
                    <span>Other liabilities</span>
                    <span>{money(sheet.manualLiabilities)}</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-100 pt-1 font-semibold text-zinc-900">
                    <span>Total liabilities</span>
                    <span>{money(sheet.totalLiabilities)}</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-400">Equity</p>
                <div className="mt-1 space-y-1 text-sm">
                  <div className="flex justify-between font-semibold text-zinc-900">
                    <span>Equity (computed)</span>
                    <span className={sheet.computedEquity >= 0 ? "text-emerald-700" : "text-red-700"}>
                      {money(sheet.computedEquity)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div>
          <form onSubmit={addAccount} className="rounded-xl border border-zinc-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-zinc-900">Add account</h3>
            <div className="mt-3 space-y-2">
              <input
                value={form.account_name}
                onChange={(e) => setForm({ ...form, account_name: e.target.value })}
                placeholder="e.g. Operating cash"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              />
              <select
                value={form.account_type}
                onChange={(e) => setForm({ ...form, account_type: e.target.value as AccountType })}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
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
                value={form.as_of}
                onChange={(e) => setForm({ ...form, as_of: e.target.value })}
                placeholder="As of date (optional)"
                type="date"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
              />
              <button
                type="submit"
                className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Add
              </button>
            </div>
          </form>

          <div className="mt-4 rounded-xl border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-3">
              <h3 className="text-sm font-semibold text-zinc-900">Ledger</h3>
            </div>
            {accounts.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-zinc-400">No accounts yet.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between px-4 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900">{a.account_name}</p>
                      <p className="text-xs text-zinc-500">
                        {TYPE_LABELS[a.account_type]}
                        {a.as_of ? ` · as of ${a.as_of}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={Number(a.balance) >= 0 ? "text-zinc-900" : "text-red-700"}>{money(Number(a.balance))}</span>
                      <button
                        onClick={() => removeAccount(a.id)}
                        className="text-xs font-medium text-red-600 hover:text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
