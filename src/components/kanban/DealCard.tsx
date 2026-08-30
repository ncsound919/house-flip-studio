"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MapPin, DollarSign } from "lucide-react";
import type { Deal } from "@/lib/types";

const sourceBadgeColor: Record<string, string> = {
  manual: "bg-zinc-100 text-zinc-600",
  county_gis: "bg-blue-50 text-blue-600",
  api: "bg-purple-50 text-purple-600",
};

export function daysInStage(deal: Deal): number {
  const start = deal.stage_changed_at ? new Date(deal.stage_changed_at) : new Date(deal.created_at);
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000));
}

export default function DealCard({ deal }: { deal: Deal }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const asking =
    deal.asking_price != null
      ? deal.asking_price.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        })
      : null;

  return (
    <Link
      href={`/deals/${deal.id}`}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="block rounded-lg border border-zinc-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      {deal.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={deal.photo_url}
          alt={deal.address}
          className="mb-2 h-24 w-full rounded-md object-cover"
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">
            {deal.address}
          </p>
          <p className="flex items-center gap-1 text-xs text-zinc-500">
            <MapPin className="h-3 w-3" />
            {[deal.city, deal.state].filter(Boolean).join(", ") || "—"}
          </p>
        </div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
            sourceBadgeColor[deal.source] ?? "bg-zinc-100 text-zinc-600"
          }`}
        >
          {deal.source === "county_gis" ? "GIS" : deal.source}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-xs text-zinc-600">
        {asking ? (
          <span className="flex items-center gap-1 font-medium text-zinc-900">
            <DollarSign className="h-3 w-3" />
            {asking}
          </span>
        ) : (
          <span className="text-zinc-400">No asking price</span>
        )}
        <span className="text-zinc-400">{daysInStage(deal)}d in stage</span>
      </div>
    </Link>
  );
}
