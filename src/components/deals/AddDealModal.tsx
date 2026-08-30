"use client";

import { useState } from "react";
import PropertyLookupForm, { type PropertyLookupData } from "./PropertyLookupForm";

const COUNTIES = ["Mecklenburg", "Wake", "Durham", "Guilford"];

export default function AddDealModal({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [step, setStep] = useState<"lookup" | "confirm">("lookup");
  const [lookup, setLookup] = useState<{ data: PropertyLookupData; county: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    address: "",
    city: "",
    state: "NC",
    zip: "",
    asking_price: "",
    sqft: "",
    beds: "",
    baths: "",
    year_built: "",
    lot_size: "",
  });

  if (!open) return null;

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [key]: e.target.value });

  const handleLookupResult = (result: PropertyLookupData, county: string) => {
    setLookup({ data: result, county });
    setForm((f) => ({
      ...f,
      address: result.address,
      city: f.city,
      zip: f.zip,
      asking_price: f.asking_price,
      sqft: f.sqft,
      year_built: result.data.yearBuilt ?? f.year_built,
      lot_size: result.data.lotSize ?? f.lot_size,
      // Never fabricate values; GIS fields are user-entered.
    }));
    setStep("confirm");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const payload = {
      address: form.address,
      city: form.city || null,
      state: form.state || "NC",
      zip: form.zip || null,
      asking_price: form.asking_price ? Number(form.asking_price) : null,
      sqft: form.sqft ? Number(form.sqft) : null,
      beds: form.beds ? Number(form.beds) : null,
      baths: form.baths ? Number(form.baths) : null,
      year_built: form.year_built ? Number(form.year_built) : null,
      lot_size: form.lot_size || null,
      source: lookup?.county ? "county_gis" : "manual",
    };

    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create deal");
      }
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deal");
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep("lookup");
    setLookup(null);
    setForm({
      address: "",
      city: "",
      state: "NC",
      zip: "",
      asking_price: "",
      sqft: "",
      beds: "",
      baths: "",
      year_built: "",
      lot_size: "",
    });
    setError(null);
  };

  const inputCls =
    "rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
  const labelCls = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        reset();
        onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Add Deal</h2>
            <p className="text-sm text-zinc-500">
              {step === "lookup"
                ? "Step 1 — Look up the property (optional) or enter details manually."
                : "Step 2 — Confirm details and add to pipeline."}
            </p>
          </div>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-zinc-400 hover:text-zinc-600"
          >
            ×
          </button>
        </div>

        {error ? (
          <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : null}

        {step === "lookup" ? (
          <div className="space-y-5">
            <PropertyLookupForm
              onResult={handleLookupResult}
              onCancel={() => {
                reset();
                onClose();
              }}
            />
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-200" />
              <span className="text-xs text-zinc-400">or enter manually</span>
              <div className="h-px flex-1 bg-zinc-200" />
            </div>
            <button
              onClick={() => setStep("confirm")}
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Enter property details manually
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            {lookup?.county ? (
              <p className="col-span-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
                Property data sourced from {lookup.county} County GIS portal. Review and fill
                missing fields below.
              </p>
            ) : null}

            <label className={`col-span-2 ${labelCls}`}>
              Address *
              <input
                required
                value={form.address}
                onChange={set("address")}
                className={inputCls}
              />
            </label>
            <label className={labelCls}>
              City
              <input value={form.city} onChange={set("city")} className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}>
                State
                <input value={form.state} onChange={set("state")} className={inputCls} />
              </label>
              <label className={labelCls}>
                ZIP
                <input value={form.zip} onChange={set("zip")} className={inputCls} />
              </label>
            </div>
            <label className={labelCls}>
              Asking price
              <input type="number" min="0" value={form.asking_price} onChange={set("asking_price")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Sqft
              <input type="number" min="0" value={form.sqft} onChange={set("sqft")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Beds
              <input type="number" min="0" value={form.beds} onChange={set("beds")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Baths
              <input type="number" min="0" step="0.5" value={form.baths} onChange={set("baths")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Year built
              <input type="number" min="1800" max="2026" value={form.year_built} onChange={set("year_built")} className={inputCls} />
            </label>
            <label className={labelCls}>
              Lot size
              <input value={form.lot_size} placeholder="e.g. 0.25 ac" onChange={set("lot_size")} className={inputCls} />
            </label>

            <div className="col-span-2 mt-2 flex justify-between">
              <button
                type="button"
                onClick={() => setStep("lookup")}
                className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
              >
                ← Back to lookup
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    onClose();
                  }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Adding…" : "Add to Pipeline"}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
