"use client";

import type { ListingCard } from "@/lib/listingSources/types";
import { Calculator, Plus, MapPin, BedDouble, Bath, Ruler, Calendar, ImageIcon } from "lucide-react";

interface LeadResultsProps {
  results: ListingCard[];
  onScore: (card: ListingCard) => void;
  onAdd: (card: ListingCard) => void;
  addingAddress?: string | null;
}

function formatPrice(price?: number) {
  if (price == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(price);
}

function formatSqft(sqft?: number) {
  if (sqft == null) return "—";
  return `${sqft.toLocaleString()} sqft`;
}

function SourceBadge({ card }: { card: ListingCard }) {
  const label = card.source_label;
  if (label === "zillow") {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
        zillow
      </span>
    );
  }
  if (label === "county_gis") {
    return (
      <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
        county_gis
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
      {label}
    </span>
  );
}

export default function LeadResults({ results, onScore, onAdd, addingAddress }: LeadResultsProps) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center">
        <p className="text-sm font-medium text-zinc-700">No leads found</p>
        <p className="mt-1 text-sm text-zinc-500">Try a different address or county. Zillow results may be unavailable — county GIS guidance will still appear.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {results.map((card, idx) => {
        const isApi = card.source === "api";
        const key = `${card.address}-${card.county}-${idx}`;
        const isAdding = addingAddress === card.address;
        return (
          <div
            key={key}
            className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
          >
            {card.photo_url ? (
              <img
                src={card.photo_url}
                alt={card.address}
                className="h-36 w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-36 w-full items-center justify-center bg-zinc-100 text-zinc-400">
                <ImageIcon className="h-8 w-8" />
              </div>
            )}

            <div className="flex flex-1 flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900" title={card.address}>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      {card.address}
                    </span>
                  </p>
                  {card.city ? (
                    <p className="text-xs text-zinc-500">{card.city}, NC</p>
                  ) : (
                    <p className="text-xs text-zinc-500">{card.county} County</p>
                  )}
                </div>
                <SourceBadge card={card} />
              </div>

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
                <span className="font-semibold text-zinc-900">{formatPrice(card.price)}</span>
                <span className="inline-flex items-center gap-1">
                  <Ruler className="h-3 w-3 text-zinc-400" /> {formatSqft(card.sqft)}
                </span>
                {(card.beds != null || card.baths != null) && (
                  <span className="inline-flex items-center gap-1">
                    {card.beds != null && (
                      <span className="inline-flex items-center gap-1">
                        <BedDouble className="h-3 w-3 text-zinc-400" /> {card.beds} bd
                      </span>
                    )}
                    {card.baths != null && (
                      <span className="inline-flex items-center gap-1">
                        <Bath className="h-3 w-3 text-zinc-400" /> {card.baths} ba
                      </span>
                    )}
                  </span>
                )}
                {card.year_built != null && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-zinc-400" /> {card.year_built}
                  </span>
                )}
              </div>

              {isApi && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  Scraped data — stale. Confirm before acting. Not verified.
                </div>
              )}

              {card.disclaimer && !isApi && (
                <p className="line-clamp-3 text-xs text-zinc-500">{card.disclaimer}</p>
              )}
              {card.disclaimer && isApi && (
                <p className="line-clamp-2 text-[11px] text-zinc-400">{card.disclaimer}</p>
              )}

              <div className="mt-auto flex gap-2 pt-2">
                <button
                  onClick={() => onScore(card)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                >
                  <Calculator className="h-4 w-4" /> Score
                </button>
                <button
                  onClick={() => onAdd(card)}
                  disabled={isAdding}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> {isAdding ? "Adding…" : "Add to pipeline"}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
