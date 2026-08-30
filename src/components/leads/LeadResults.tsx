"use client";

import type { ListingCard } from "@/lib/listingSources/types";
import {
  Calculator,
  Plus,
  MapPin,
  Ruler,
  Calendar,
  LandPlot,
  User,
  Building2,
  CircleDollarSign,
} from "lucide-react";

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

function formatNumber(n?: number) {
  if (n == null) return "—";
  return n.toLocaleString("en-US");
}

function SourceBadge({ card }: { card: ListingCard }) {
  const label = card.source_label;
  if (label === "wake_tax_parcel") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
        <LandPlot className="h-3 w-3" /> Tax record
      </span>
    );
  }
  if (label === "county_gis") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
        <Building2 className="h-3 w-3" /> Manual entry
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
      {label}
    </span>
  );
}

function isEmptyGuidance(card: ListingCard): boolean {
  // county_gis source_label with no parcel data = guidance card, not a real lead
  return card.source_label === "county_gis" && !card.parcel;
}

export default function LeadResults({ results, onScore, onAdd, addingAddress }: LeadResultsProps) {
  const realLeads = results.filter((c) => !isEmptyGuidance(c));
  const guidance = results.filter(isEmptyGuidance);

  return (
    <div className="space-y-6">
      {/* Real leads */}
      {realLeads.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {realLeads.map((card, idx) => {
            const key = `${card.address}-${card.county}-${idx}`;
            const isAdding = addingAddress === card.address;
            return (
              <div
                key={key}
                className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Top accent */}
                <div className="h-1.5 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500" />

                <div className="flex flex-1 flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-start gap-1.5 text-sm font-semibold text-zinc-900">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                        <span className="line-clamp-2" title={card.address}>
                          {card.address}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {card.city ? `${card.city}, NC` : `${card.county} County`}
                      </p>
                    </div>
                    <SourceBadge card={card} />
                  </div>

                  {/* Price + size row */}
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-bold tracking-tight text-zinc-900">
                      {formatPrice(card.price)}
                    </span>
                    <span className="text-xs text-zinc-500">
                      <Ruler className="mr-1 inline h-3 w-3 text-zinc-400" />
                      {formatNumber(card.sqft)} sqft
                    </span>
                  </div>

                  {/* Parcel detail */}
                  {card.parcel ? (
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-zinc-50 p-3 text-xs">
                      {card.parcel.owner ? (
                        <div className="col-span-2 flex items-center gap-1.5 text-zinc-600">
                          <User className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                          <span className="truncate" title={card.parcel.owner}>
                            {card.parcel.owner}
                          </span>
                        </div>
                      ) : null}
                      {card.parcel.assessedValue ? (
                        <div className="flex items-center gap-1.5 text-zinc-600">
                          <CircleDollarSign className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                          Assessed {formatPrice(card.parcel.assessedValue)}
                        </div>
                      ) : null}
                      {card.parcel.acreage ? (
                        <div className="flex items-center gap-1.5 text-zinc-600">
                          <LandPlot className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                          {card.parcel.acreage} acres
                        </div>
                      ) : null}
                      {card.parcel.pin ? (
                        <div className="text-zinc-500">PIN {card.parcel.pin}</div>
                      ) : null}
                      {card.year_built ? (
                        <div className="flex items-center gap-1.5 text-zinc-600">
                          <Calendar className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                          {card.year_built}
                        </div>
                      ) : null}
                    </dl>
                  ) : null}

                  {card.disclaimer ? (
                    <p className="text-[11px] leading-snug text-zinc-400">{card.disclaimer}</p>
                  ) : null}

                  <div className="mt-auto flex gap-2 pt-1">
                    <button
                      onClick={() => onScore(card)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:border-blue-300 hover:text-blue-700"
                    >
                      <Calculator className="h-4 w-4" /> Score
                    </button>
                    <button
                      onClick={() => onAdd(card)}
                      disabled={isAdding}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      <Plus className="h-4 w-4" /> {isAdding ? "Adding…" : "Add to pipeline"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-zinc-700">No real leads found</p>
          <p className="mt-1 text-sm text-zinc-500">
            Try a different address or county. Only Wake County returns live tax records right now — other counties show manual-entry guidance.
          </p>
        </div>
      )}

      {/* Manual-entry guidance cards */}
      {guidance.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Manual entry — county portal guidance
          </p>
          <div className="space-y-3">
            {guidance.map((card, idx) => (
              <div
                key={`guidance-${idx}`}
                className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4"
              >
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-semibold text-zinc-800">
                    {card.address === "…" ? `${card.county} County` : card.address}
                  </p>
                  <SourceBadge card={card} />
                </div>
                {card.disclaimer ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">{card.disclaimer}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
