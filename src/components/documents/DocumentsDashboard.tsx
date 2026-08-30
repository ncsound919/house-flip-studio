"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DocStatus, DocumentRow } from "@/app/api/documents/route";
import DocumentChecklistItem from "./DocumentChecklistItem";

function isOverdue(doc: DocumentRow): boolean {
  if (doc.status === "received" || doc.status === "filed") return false;
  if (!doc.requested_at) return false;
  const requested = new Date(doc.requested_at + "T00:00:00");
  const deadline = new Date(requested);
  deadline.setDate(deadline.getDate() + 7);
  return deadline.getTime() < Date.now();
}

export default function DocumentsDashboard() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "missing" | "overdue" | "received">("all");

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      const { documents: data } = await res.json();
      setDocs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const updateStatus = useCallback(
    async (id: string, status: DocStatus) => {
      try {
        await fetch(`/api/documents/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        fetchDocs();
      } catch {
        // ignore
      }
    },
    [fetchDocs]
  );

  const grouped = useMemo(() => {
    const filtered = docs.filter((d) => {
      if (filter === "all") return true;
      if (filter === "missing") return d.status === "missing";
      if (filter === "overdue") return isOverdue(d);
      return d.status === "received" || d.status === "filed";
    });

    const map = new Map<string, DocumentRow[]>();
    for (const doc of filtered) {
      const dealId = String((doc.deals as { id: string } | null)?.id ?? doc.deal_id);
      const list = map.get(dealId) ?? [];
      list.push(doc);
      map.set(dealId, list);
    }
    return map;
  }, [docs, filter]);

  if (loading) return <p className="text-sm text-zinc-500">Loading documents…</p>;

  const openCount = docs.filter((d) => d.status === "missing" || d.status === "requested").length;
  const overdueCount = docs.filter(isOverdue).length;

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-zinc-900">Documents</h1>
        <p className="text-sm text-zinc-500">
          {openCount} open · {overdueCount} overdue
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mb-5 flex gap-2">
        {(
          [
            ["all", "All"],
            ["missing", "Missing"],
            ["overdue", "Overdue"],
            ["received", "Received"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === value
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 hover:bg-zinc-100 border border-zinc-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {grouped.size === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-400">
          No documents match this filter.
        </p>
      ) : (
        <div className="space-y-5">
          {[...grouped.entries()].map(([dealId, list]) => {
            const deal = list[0]?.deals as { id: string; address: string; stage: string } | null;
            return (
              <div key={dealId} className="rounded-xl border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-4 py-3">
                  <Link
                    href={`/deals/${dealId}`}
                    className="text-sm font-semibold text-zinc-900 hover:text-blue-600"
                  >
                    {deal?.address ?? "Deal"}
                  </Link>
                  {deal?.stage ? (
                    <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600">
                      {deal.stage}
                    </span>
                  ) : null}
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                      <th className="px-3 py-2">Document</th>
                      <th className="px-3 py-2">Requested</th>
                      <th className="px-3 py-2">Received</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((doc) => (
                      <DocumentChecklistItem
                        key={doc.id}
                        doc={doc}
                        onStatusChange={updateStatus}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
