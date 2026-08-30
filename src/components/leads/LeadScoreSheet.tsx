"use client";

import { useEffect, useMemo, useState } from "react";
import type { ListingCard } from "@/lib/listingSources/types";
import { calculateUnderwriting } from "@/lib/underwriting";

interface LeadScoreSheetProps {
  card: ListingCard | null;
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

export default function LeadScoreSheet({ card }: LeadScoreSheetProps) {
  const [form, setForm] = useState({
    arv: "",
    rehabEstimate: "",
    purchasePrice: "",
    holdingMonths: "6",
    downPaymentPct: "20",
    interestRate: "10",
    loanPoints: "0",
  });

  // Prefill when card changes; do not fabricate ARV
  useEffect(() => {
    if (!card) return;
    setForm((prev) => ({
      ...prev,
      purchasePrice: card.price != null ? String(card.price) : prev.purchasePrice,
      // keep arv/rehab as user-entered; only reset purchasePrice from card
    }));
  }, [card]);

  const input = useMemo(
    () => ({
      arv: Number(form.arv) || 0,
      rehabEstimate: Number(form.rehabEstimate) || 0,
      purchasePrice: Number(form.purchasePrice) || 0,
      holdingMonths: Number(form.holdingMonths) || 0,
      downPaymentPct: Number(form.downPaymentPct) || 0,
      interestRate: Number(form.interestRate) || 0,
      loanPoints: Number(form.loanPoints) || 0,
    }),
    [form]
  );

  const result = useMemo(() => calculateUnderwriting(input), [input]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  if (!card) return null;

  const missingPrice = card.price == null && !form.purchasePrice;
  const missingArv = !form.arv || Number(form.arv) === 0;
  const showPlaceholder = missingPrice || missingArv;

  const inputCls =
    "rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const labelCls = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

  const rows: [string, string][] = [
    ["70% MAO", money(result.maxOffer)],
    ["Final purchase price", money(result.finalPurchasePrice)],
    ["Acquisition costs", money(result.acquisitionCosts)],
    ["Holding costs / month", money(result.holdingCosts)],
    ["Selling costs (8% of ARV)", money(result.sellingCosts)],
    ["Financing costs", money(result.financingCosts)],
    ["Total project cost", money(result.totalProjectCost)],
    ["Projected profit", money(result.projectedProfit)],
    ["ROI", pct(result.roi)],
    ["Cash-on-cash", pct(result.cashOnCash)],
    ["Down payment", money(result.downPaymentAmount)],
    ["Loan amount", money(result.loanAmount)],
  ];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-zinc-900">Score: {card.address}</h2>
        <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
          {card.county}
        </span>
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
            card.source_label === "zillow"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : card.source_label === "county_gis"
                ? "border-blue-200 bg-blue-50 text-blue-700"
                : "border-zinc-200 bg-zinc-100 text-zinc-600"
          }`}
        >
          {card.source_label}
        </span>
      </div>
      {card.disclaimer ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {card.disclaimer}
        </p>
      ) : null}
      <p className="mb-4 text-xs text-zinc-500">
        Deterministic underwriting via <code className="rounded bg-zinc-100 px-1 py-0.5">src/lib/underwriting.ts</code> — same math as the deal underwriting form. No LLM.
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Inputs */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">Inputs</h3>
          <div className="grid grid-cols-2 gap-3">
            <label className={labelCls}>
              ARV $
              <input
                type="number"
                min="0"
                value={form.arv}
                onChange={set("arv")}
                placeholder={missingArv ? "enter ARV" : undefined}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Rehab estimate $
              <input type="number" min="0" value={form.rehabEstimate} onChange={set("rehabEstimate")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Purchase price $
              <input
                type="number"
                min="0"
                value={form.purchasePrice}
                onChange={set("purchasePrice")}
                placeholder={missingPrice ? "enter purchase price" : undefined}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              Holding months
              <input type="number" min="0" value={form.holdingMonths} onChange={set("holdingMonths")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Down payment %
              <input type="number" min="0" max="100" value={form.downPaymentPct} onChange={set("downPaymentPct")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Interest rate %/yr
              <input type="number" min="0" value={form.interestRate} onChange={set("interestRate")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Loan points %
              <input type="number" min="0" value={form.loanPoints} onChange={set("loanPoints")} className={inputCls} />
            </label>
          </div>
          <div className="mt-3 space-y-1 text-xs text-zinc-500">
            {card.sqft != null && <p>Sqft from listing: {card.sqft.toLocaleString()}</p>}
            {card.beds != null || card.baths != null ? (
              <p>
                {card.beds != null ? `${card.beds} bd` : ""} {card.baths != null ? `${card.baths} ba` : ""}
              </p>
            ) : null}
            {card.year_built != null && <p>Year built: {card.year_built}</p>}
            {card.photo_url && <p className="truncate">Photo: {card.photo_url}</p>}
          </div>
          {missingPrice && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Missing price — enter purchase price to calculate.
            </p>
          )}
          {card.price == null && card.sqft == null && !missingPrice && (
            <p className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              Listing is missing price/sqft — enter missing field above. Nothing is fabricated.
            </p>
          )}
        </div>

        {/* Live results */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">Live Results</h3>
          {showPlaceholder ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
              <p className="text-sm font-medium text-zinc-700">Enter missing field to see calculations</p>
              <p className="mt-1 text-xs text-zinc-500">
                {missingPrice && missingArv
                  ? "ARV and purchase price are required."
                  : missingArv
                    ? "ARV is required for 70% MAO."
                    : "Purchase price is required."}
              </p>
              <p className="mt-2 text-[11px] text-zinc-400">70% MAO = ARV × 0.70 − rehab. Final price capped at MAO.</p>
            </div>
          ) : (
            <>
              <div
                className={`mb-3 inline-block rounded-full px-3 py-1 text-sm font-bold ${
                  result.passes70Rule ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                }`}
              >
                70% Rule: {result.passes70Rule ? "PASSES" : "FAILS"}
              </div>
              <div className="space-y-1">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between border-b border-zinc-50 py-1.5 text-sm">
                    <span className="text-zinc-500">{label}</span>
                    <span className="font-medium text-zinc-900">{value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-zinc-400">
                All figures are deterministic math. 70% rule caps purchase price at ARV × 0.70 − rehab. Cash-on-cash = profit / cash invested.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
