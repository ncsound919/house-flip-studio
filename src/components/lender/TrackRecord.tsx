"use client";

import { useEffect, useState } from "react";
import type { TrackRecordRow, TrackRecordSummary } from "@/lib/finance/trackRecord";

const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const num = (n: number | null | undefined) => (n == null ? "—" : `${n}`);

export default function TrackRecord() {
  const [rows, setRows] = useState<TrackRecordRow[]>([]);
  const [summary, setSummary] = useState<TrackRecordSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/finance/track-record");
        if (!res.ok) throw new Error("Failed to load track record");
        const data = await res.json();
        setRows(data.rows);
        setSummary(data.summary);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load track record");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Loading track record…</p>;

  const cards = [
    ["Completed flips", summary?.realizedCount != null ? String(summary.realizedCount) : "—"],
    ["Realized profit", money(summary?.realizedProfit)],
    ["Avg profit / flip", money(summary?.avgProfit)],
    ["Avg cycle time", summary?.avgCycleDays != null ? `${summary.avgCycleDays} days` : "—"],
    ["Capital invested", money(summary?.totalInvested)],
    ["Realized ROI", summary?.roi != null ? `${summary.roi}%` : "—"],
  ];

  return (
    <div>
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Realized rows only from Closed deals with a recorded sale price. Projected rows are labeled and excluded from the summary.
        </p>
        <div className="flex gap-2">
          <a
            href="/api/finance/track-record/export?format=csv"
            className="rounded-lg bg-white border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Export CSV
          </a>
          <a
            href="/api/finance/track-record/export?format=pdf"
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
          >
            Lender PDF
          </a>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-xs font-medium text-zinc-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-400">
          No deals yet. As you close flips with a recorded sale price, your track record builds here automatically.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2 text-right">Purchase</th>
                <th className="px-3 py-2 text-right">Rehab</th>
                <th className="px-3 py-2 text-right">Sale</th>
                <th className="px-3 py-2 text-right">Profit</th>
                <th className="px-3 py-2 text-right">ROI</th>
                <th className="px-3 py-2 text-right">Cycle</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dealId} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-medium text-zinc-900">{r.address}</span>
                    {r.city ? <span className="text-zinc-500">, {r.city}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                        r.isRealized ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {r.isRealized ? "realized" : "projected"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600">{money(r.purchasePrice)}</td>
                  <td className="px-3 py-2 text-right text-zinc-600">{money(r.rehabActual)}</td>
                  <td className="px-3 py-2 text-right text-zinc-600">{money(r.salePrice)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${(r.profit ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {money(r.profit)}
                  </td>
                  <td className="px-3 py-2 text-right text-zinc-600">{r.roi != null ? `${r.roi}%` : "—"}</td>
                  <td className="px-3 py-2 text-right text-zinc-600">{num(r.cycleDays)} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
