"use client";

import { useState, useEffect } from "react";
import { Search, MapPin } from "lucide-react";

const COUNTIES = ["Mecklenburg", "Wake", "Durham", "Guilford"] as const;

interface LeadSearchBarProps {
  county: string;
  address: string;
  onSearch: (county: string, address: string) => void;
  loading?: boolean;
}

export default function LeadSearchBar({ county, address, onSearch, loading }: LeadSearchBarProps) {
  const [localCounty, setLocalCounty] = useState(county);
  const [localAddress, setLocalAddress] = useState(address);

  useEffect(() => {
    setLocalCounty(county);
  }, [county]);

  useEffect(() => {
    setLocalAddress(address);
  }, [address]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!localCounty) return;
    onSearch(localCounty, localAddress.trim());
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:flex-row sm:items-end"
    >
      <label className="flex flex-1 flex-col gap-1 text-sm font-medium text-zinc-700">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <MapPin className="h-3.5 w-3.5" /> County
        </span>
        <select
          value={localCounty}
          onChange={(e) => setLocalCounty(e.target.value)}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select county</option>
          {COUNTIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-[2] flex-col gap-1 text-sm font-medium text-zinc-700">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Address / PIN
        </span>
        <input
          type="text"
          value={localAddress}
          onChange={(e) => setLocalAddress(e.target.value)}
          placeholder="123 Main St or parcel PIN"
          className="rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </label>

      <button
        type="submit"
        disabled={loading || !localCounty}
        className="inline-flex h-[42px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed sm:shrink-0"
      >
        <Search className="h-4 w-4" />
        {loading ? "Searching…" : "Find leads"}
      </button>
    </form>
  );
}
