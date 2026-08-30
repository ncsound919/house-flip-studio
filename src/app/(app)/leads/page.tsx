"use client";

import { useState } from "react";
import LeadSearchBar from "@/components/leads/LeadSearchBar";
import LeadResults from "@/components/leads/LeadResults";
import LeadScoreSheet from "@/components/leads/LeadScoreSheet";
import type { ListingCard } from "@/lib/listingSources/types";

export default function LeadsPage() {
  const [county, setCounty] = useState("Mecklenburg");
  const [address, setAddress] = useState("");
  const [results, setResults] = useState<ListingCard[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ListingCard | null>(null);
  const [addingAddress, setAddingAddress] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const handleSearch = async (nextCounty: string, nextAddress: string) => {
    setCounty(nextCounty);
    setAddress(nextAddress);
    setLoading(true);
    setError(null);
    setHasSearched(true);
    setSelectedCard(null);
    try {
      const res = await fetch("/api/lead-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ county: nextCounty, address: nextAddress, sources: ["county_gis", "tax_records"] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setResults(data.results ?? []);
      setWarnings(data.warnings ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleScore = (card: ListingCard) => {
    setSelectedCard(card);
    // scroll into view on mobile
    if (typeof window !== "undefined") {
      setTimeout(() => {
        document.getElementById("lead-score-sheet")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  const handleAdd = async (card: ListingCard) => {
    setAddingAddress(card.address);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        address: card.address,
        city: card.city ?? null,
        state: "NC",
        asking_price: card.price ?? null,
        sqft: card.sqft ?? null,
        beds: card.beds ?? null,
        baths: card.baths ?? null,
        year_built: card.year_built ?? null,
        photo_url: card.photo_url ?? null,
        source: card.source === "api" ? "api" : "county_gis",
        stage: "Lead",
      };
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add to pipeline");
      setToast(`Added ${card.address} to pipeline`);
      setTimeout(() => setToast(null), 3000);
      // clear selection after add? keep for further scoring; do not clear results
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add to pipeline");
    } finally {
      setAddingAddress(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Lead Finder</h1>
        <p className="text-sm text-zinc-500">Search real county tax-record leads, score any lead with deterministic underwriting, then add to pipeline.</p>
      </div>

      <LeadSearchBar county={county} address={address} onSearch={handleSearch} loading={loading} />

      {error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          {warnings.map((w, i) => (
            <p key={i} className="text-sm text-amber-800">
              {w}
            </p>
          ))}
        </div>
      )}

      {!hasSearched ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-zinc-700">Enter a county and optional address to find leads</p>
          <p className="mt-1 text-sm text-zinc-500">
            Wake County returns real tax-record parcels. Other counties show manual-entry guidance until their feed is connected.
          </p>
        </div>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-zinc-500">Searching leads…</p>
      ) : (
        <LeadResults results={results} onScore={handleScore} onAdd={handleAdd} addingAddress={addingAddress} />
      )}

      {selectedCard && (
        <div id="lead-score-sheet">
          <LeadScoreSheet card={selectedCard} />
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
