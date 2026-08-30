"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Deal } from "@/lib/types";
import DealCard from "./DealCard";

export default function KanbanColumn({
  stage,
  deals,
  accentClass,
}: {
  stage: string;
  deals: Deal[];
  accentClass: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      className={`flex max-h-full w-72 shrink-0 flex-col rounded-xl border bg-zinc-100/70 ${
        isOver ? "border-blue-400 ring-2 ring-blue-200" : "border-zinc-200"
      }`}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${accentClass}`} />
          <h3 className="text-sm font-semibold text-zinc-800">{stage}</h3>
        </div>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-600 shadow-sm">
          {deals.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        <SortableContext
          items={deals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {deals.map((deal) => (
            <DealCard key={deal.id} deal={deal} />
          ))}
          {deals.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 py-6 text-center text-xs text-zinc-400">
              Drop deals here
            </div>
          ) : null}
        </SortableContext>
      </div>
    </div>
  );
}
