"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { createClient } from "@/lib/supabase/client";
import { DEAL_STAGES, type Deal, type DealStage } from "@/lib/types";
import KanbanColumn from "./KanbanColumn";
import DealCard from "./DealCard";
import AddDealModal from "@/components/deals/AddDealModal";

const columnAccents: Record<string, string> = {
  Lead: "bg-zinc-400",
  Inspecting: "bg-sky-400",
  Underwriting: "bg-indigo-400",
  "Offer Made": "bg-amber-400",
  "Under Contract": "bg-teal-400",
  Rehab: "bg-orange-400",
  Listed: "bg-pink-400",
  Closed: "bg-green-500",
};

const STAGE_INDEX: Map<string, number> = new Map(DEAL_STAGES.map((s, i) => [s, i]));

export default function KanbanBoard() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const fetchDeals = useCallback(async () => {
    try {
      const res = await fetch("/api/deals");
      if (!res.ok) throw new Error("Failed to load deals");
      const { deals: data } = await res.json();
      setDeals(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load deals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();

    const supabase = createClient();
    const channel = supabase
      .channel("deals-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals" },
        () => fetchDeals()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDeals]);

  const grouped = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const stage of DEAL_STAGES) map.set(stage, []);
    for (const deal of deals) {
      const list = map.get(deal.stage);
      if (list) list.push(deal);
    }
    return map;
  }, [deals]);

  const activeDeal = useMemo(
    () => deals.find((d) => d.id === activeId) ?? null,
    [deals, activeId]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const dealId = String(active.id);
    const target = over.id;

    // Dropped onto another card → use its column (stage)
    const targetDeal = deals.find((d) => d.id === target);
    const targetStageRaw =
      STAGE_INDEX.has(String(target)) && !targetDeal
        ? String(target)
        : targetDeal?.stage;

    if (!targetStageRaw || targetStageRaw === activeDeal?.stage) return;

    const targetStage = targetStageRaw as DealStage;

    // Optimistic reorder within the new column
    setDeals((prev) => {
      const without = prev.map((d) =>
        d.id === dealId ? { ...d, stage: targetStage } : d
      );
      return without;
    });

    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: targetStage }),
      });
      if (!res.ok) throw new Error("Failed to update stage");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update stage");
      fetchDeals();
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading pipeline…</p>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Pipeline</h1>
          <p className="text-sm text-zinc-500">
            {deals.length} deal{deals.length === 1 ? "" : "s"}
          </p>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
        >
          Add Deal
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-3 overflow-x-auto pb-4">
          {DEAL_STAGES.map((stage) => (
            <KanbanColumn
              key={stage}
              stage={stage}
              deals={grouped.get(stage) ?? []}
              accentClass={columnAccents[stage]}
            />
          ))}
        </div>
        <DragOverlay>
          {activeDeal ? <DealCard deal={activeDeal} /> : null}
        </DragOverlay>
      </DndContext>

      <AddDealModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => {
          setAddOpen(false);
          fetchDeals();
        }}
      />
    </div>
  );
}
