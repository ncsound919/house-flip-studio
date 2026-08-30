"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { calculateUnderwriting } from "@/lib/underwriting";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const pct = (n: number) => `${n.toFixed(1)}%`;

interface UnderwritingFormProps {
  dealId: string;
  initialArv?: number;
}

export default function UnderwritingForm({ dealId, initialArv }: UnderwritingFormProps) {
  const [form, setForm] = useState({
    arv: initialArv?.toString() ?? "",
    rehabEstimate: "",
    purchasePrice: "",
    holdingMonths: "6",
    downPaymentPct: "20",
    interestRate: "10",
    loanPoints: "0",
  });
  const [saved, setSaved] = useState<Record<string, number | boolean> | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/deals/${dealId}/underwriting`);
        if (!res.ok) return;
        const { underwriting } = await res.json();
        if (underwriting) {
          setSaved(underwriting);
          setForm({
            arv: underwriting.arv?.toString() ?? "",
            rehabEstimate: underwriting.rehab_estimate?.toString() ?? "",
            purchasePrice: underwriting.purchase_price?.toString() ?? "",
            holdingMonths: underwriting.holding_months?.toString() ?? "6",
            downPaymentPct: underwriting.down_payment_pct?.toString() ?? "20",
            interestRate: underwriting.interest_rate?.toString() ?? "10",
            loanPoints: underwriting.loan_points?.toString() ?? "0",
          });
        }
      } catch {
        // ignore load errors
      }
    };
    load();
  }, [dealId]);

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

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });

  const save = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/underwriting`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          arv: input.arv,
          rehab_estimate: input.rehabEstimate,
          purchase_price: input.purchasePrice,
          holding_months: input.holdingMonths,
          down_payment_pct: input.downPaymentPct,
          interest_rate: input.interestRate,
          loan_points: input.loanPoints,
          max_offer: result.maxOffer,
          final_purchase_price: result.finalPurchasePrice,
          passes_70_rule: result.passes70Rule,
          acquisition_costs: result.acquisitionCosts,
          holding_costs: result.holdingCosts,
          selling_costs: result.sellingCosts,
          financing_costs: result.financingCosts,
          total_project_cost: result.totalProjectCost,
          projected_profit: result.projectedProfit,
          roi: result.roi,
          cash_on_cash: result.cashOnCash,
          down_payment_amount: result.downPaymentAmount,
          loan_amount: result.loanAmount,
        }),
      });
      if (!res.ok) throw new Error("Failed to save underwriting");
      setSaveMsg("Saved to deal");
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to save underwriting");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
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
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Inputs */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-zinc-900">Underwriting Calculator</h2>
        <div className="grid grid-cols-2 gap-3">
          <label className={labelCls}>
            ARV $
            <input type="number" min="0" value={form.arv} onChange={set("arv")} className={inputCls} />
          </label>
          <label className={labelCls}>
            Rehab estimate $
            <input
              type="number"
              min="0"
              value={form.rehabEstimate}
              onChange={set("rehabEstimate")}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Purchase price $
            <input
              type="number"
              min="0"
              value={form.purchasePrice}
              onChange={set("purchasePrice")}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Holding months
            <input
              type="number"
              min="0"
              value={form.holdingMonths}
              onChange={set("holdingMonths")}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Down payment %
            <input
              type="number"
              min="0"
              max="100"
              value={form.downPaymentPct}
              onChange={set("downPaymentPct")}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Interest rate %/yr
            <input
              type="number"
              min="0"
              value={form.interestRate}
              onChange={set("interestRate")}
              className={inputCls}
            />
          </label>
          <label className={labelCls}>
            Loan points %
            <input type="number" min="0" value={form.loanPoints} onChange={set("loanPoints")} className={inputCls} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save to Deal"}
          </button>
          <a
            href={`/api/deals/${dealId}/underwriting/export`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
          >
            <Download className="h-4 w-4" /> Export PDF
          </a>
          {saveMsg ? (
            <span className={`text-sm ${saveMsg === "Saved to deal" ? "text-green-600" : "text-red-600"}`}>
              {saveMsg}
            </span>
          ) : null}
        </div>
      </div>

      {/* Live results */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-zinc-900">Live Results</h2>
        <div
          className={`mb-3 inline-block rounded-full px-3 py-1 text-sm font-bold ${
            result.passes70Rule ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          70% Rule: {result.passes70Rule ? "PASSES" : "FAILS"}
        </div>
        <div className="space-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between border-b border-zinc-50 py-1 text-sm">
              <span className="text-zinc-500">{label}</span>
              <span className="font-medium text-zinc-900">{value}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-zinc-400">
          All figures are deterministic math. The 70% rule caps purchase price at ARV × 0.70 − rehab.
        </p>
      </div>
    </div>
  );
}
