"use client";

import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";

const COUNTIES = ["Mecklenburg", "Wake", "Durham", "Guilford"];

export interface PropertyLookupData {
  address: string;
  county: string;
  source: "county_gis";
  portalUrl: string;
  guidance: string;
  data: {
    taxAssessment?: string;
    parcelId?: string;
    yearBuilt?: string;
    lotSize?: string;
    ownerName?: string;
  };
}

export default function PropertyLookupForm({
  initialAddress = "",
  onResult,
  onCancel,
}: {
  initialAddress?: string;
  onResult: (result: PropertyLookupData, county: string) => void;
  onCancel?: () => void;
}) {
  const [address, setAddress] = useState(initialAddress);
  const [county, setCounty] = useState("Mecklenburg");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PropertyLookupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState({
    taxAssessment: "",
    parcelId: "",
    yearBuilt: "",
    lotSize: "",
    ownerName: "",
  });

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/property-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, county }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lookup failed");
      setResult(data.result);
      setFields({
        taxAssessment: "",
        parcelId: "",
        yearBuilt: "",
        lotSize: "",
        ownerName: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const confirm = () => {
    if (!result) return;
    onResult({ ...result, data: fields }, county);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={lookup} className="grid grid-cols-2 gap-3">
        <label className="col-span-2 flex flex-col gap-1 text-sm font-medium text-zinc-700">
          Property address
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="123 Main St"
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
          County
          <select
            value={county}
            onChange={(e) => setCounty(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            {COUNTIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={loading || !address.trim()}
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Search className="h-4 w-4" />
            {loading ? "Looking up…" : "Look up property"}
          </button>
        </div>
      </form>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-sm font-semibold text-zinc-900">
            {result.address} · {result.county} County
          </p>
          <a
            href={result.portalUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open {result.county} GIS portal
          </a>
          <p className="mt-2 text-sm text-zinc-600">{result.guidance}</p>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Tax assessment $
              <input
                value={fields.taxAssessment}
                onChange={(e) => setFields({ ...fields, taxAssessment: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Parcel ID / PIN
              <input
                value={fields.parcelId}
                onChange={(e) => setFields({ ...fields, parcelId: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Year built
              <input
                value={fields.yearBuilt}
                onChange={(e) => setFields({ ...fields, yearBuilt: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Lot size
              <input
                value={fields.lotSize}
                onChange={(e) => setFields({ ...fields, lotSize: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-zinc-600">
              Owner name (from public record)
              <input
                value={fields.ownerName}
                onChange={(e) => setFields({ ...fields, ownerName: e.target.value })}
                className="rounded border border-zinc-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="mt-3 flex justify-end gap-2">
            {onCancel ? (
              <button
                onClick={onCancel}
                className="rounded-lg px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
            ) : null}
            <button
              onClick={confirm}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Use this data
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
