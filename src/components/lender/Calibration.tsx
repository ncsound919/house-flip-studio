"use client";

import { useEffect, useState } from "react";
import type { DealCalibration, MarketCalibration } from "@/lib/finance/calibration";

const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

interface CalibrationData {
  deals: DealCalibration[];
  market: MarketCalibration;
  baselineRehabPerSqft: number;
}

function pct(n: number | null | undefined, suffix = "%") {
  return n == null ? "—" : `${n}${suffix}`;
}

function accuracyClass(n: number | null | undefined): string {
  if (n == null) return "text-zinc-400";
  if (n >= 95 && n <= 105) return "text-emerald-700";
  if (n >= 85 && n <= 115) return "text-amber-700";
  return "text-red-700";
}

export default function Calibration() {
  const [data, setData] = useState<CalibrationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/finance/calibration");
        if (!res.ok) throw new Error("Failed to load calibration");
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-sm text-zinc-500">Loading calibration…</p>;
  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!data) return null;

  const m = data.market;
  const cards = [
    ["Closed deals", String(m.sampleSize)],
    ["ARV accuracy", pct(m.arvAccuracyAvg)],
    ["Rehab variance", m.rehabVarianceAvg != null ? `${m.rehabVarianceAvg > 0 ? "+" : ""}${pct(m.rehabVarianceAvg)}` : "—"],
    ["Profit accuracy", pct(m.profitAccuracyAvg)],
    ["Actual rehab $/sqft", m.actualRehabPerSqft != null ? `$${m.actualRehabPerSqft}` : "—"],
    ["Profit calls", `${m.overProjectedCount} over / ${m.underProjectedCount} under`],
  ];

  const rehabGap = m.rehabPerSqftVsBaselinePct;
  const showRehabCallout = rehabGap != null && Math.abs(rehabGap) >= 15;

  return (
    <div>
      <p className="mb-5 text-sm text-zinc-500">
        Every closed deal is measured against what underwriting projected. This is the learning loop that makes
        the system's estimates converge on reality — and it's built only from real outcomes.
      </p>

      {m.sampleSize === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-400">
          No closed deals yet. Once flips close with real numbers, the system starts calibrating its estimates.
        </p>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
                <p className="text-xs font-medium text-zinc-500">{label}</p>
                <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
              </div>
            ))}
          </div>

          {showRehabCallout ? (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Your actual rehab costs are <strong>{Math.abs(rehabGap)}% {rehabGap > 0 ? "above" : "below"}</strong> the
              $/{data.baselineRehabPerSqft} assumption in Settings. Update{" "}
              <strong>Underwriting assumptions → Rehab $/sqft</strong> to ${m.actualRehabPerSqft} so future underwriting
              is calibrated to your market.
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2 text-right">ARV (proj → actual)</th>
                  <th className="px-3 py-2 text-right">ARV accuracy</th>
                  <th className="px-3 py-2 text-right">Rehab (proj → actual)</th>
                  <th className="px-3 py-2 text-right">Rehab variance</th>
                  <th className="px-3 py-2 text-right">Profit (proj → realized)</th>
                  <th className="px-3 py-2 text-right">Hold (proj → actual)</th>
                </tr>
              </thead>
              <tbody>
                {data.deals.map((d) => (
                  <tr key={d.dealId} className="border-b border-zinc-100 last:border-0">
                    <td className="px-3 py-2 font-medium text-zinc-900">{d.address}</td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {d.arv ? `${money(d.arv.projected)} → ${money(d.arv.actual)}` : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${accuracyClass(d.arv?.accuracyPct)}`}>
                      {pct(d.arv?.accuracyPct)}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {d.rehab ? `${money(d.rehab.projected)} → ${money(d.rehab.actual)}` : "—"}
                    </td>
                    <td className={`px-3 py-2 text-right font-medium ${d.rehab != null && d.rehab.variancePct > 0 ? "text-red-700" : "text-zinc-600"}`}>
                      {pct(d.rehab?.variancePct, d.rehab != null && d.rehab.variancePct > 0 ? "%" : "%")}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {d.profit ? `${money(d.profit.projected)} → ${money(d.profit.actual)}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-zinc-600">
                      {d.holdMonths ? `${d.holdMonths.projected} → ${d.holdMonths.actual} mo` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
