"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import type { DocStatus, DocType, DocumentRow } from "@/app/api/documents/route";
import type { RehabItem } from "@/app/api/deals/[id]/rehab-items/route";

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  permit: "Permit",
  contractor_quote: "Contractor Quote",
  signed_contract: "Signed Contract",
  draw_request: "Draw Request",
  conditional_lien_waiver: "Conditional Lien Waiver",
  unconditional_lien_waiver: "Unconditional Lien Waiver",
  w9: "W-9",
  insurance_cert: "Insurance Certificate",
};

const DOC_TYPE_DESC: Record<DocType, string> = {
  permit: "Required before permit-required work starts",
  contractor_quote: "Required before contracting",
  signed_contract: "Required before work starts",
  draw_request: "Required before each payment",
  conditional_lien_waiver: "Required with each draw payment",
  unconditional_lien_waiver: "Required for final payment",
  w9: "Required before first payment",
  insurance_cert: "Required before first payment",
};

// Which doc types apply based on the item's status.
const DOCS_BY_STATUS: { types: DocType[]; minStatus?: RehabItem["status"] }[] = [
  { types: ["contractor_quote", "signed_contract", "w9", "insurance_cert"] },
  { types: ["permit"] },
  { types: ["draw_request"], minStatus: "contracted" },
  { types: ["conditional_lien_waiver"], minStatus: "in_progress" },
  { types: ["unconditional_lien_waiver"], minStatus: "completed" },
];

const statusBadge: Record<DocStatus, string> = {
  missing: "bg-zinc-100 text-zinc-600",
  requested: "bg-amber-50 text-amber-700",
  received: "bg-blue-50 text-blue-700",
  filed: "bg-green-50 text-green-700",
};

function isOverdue(doc: DocumentRow): boolean {
  if (doc.status === "received" || doc.status === "filed") return false;
  if (!doc.requested_at) return false;
  const requested = new Date(doc.requested_at + "T00:00:00");
  const deadline = new Date(requested);
  deadline.setDate(deadline.getDate() + 7);
  return deadline.getTime() < Date.now();
}

function docsForItem(item: RehabItem): DocType[] {
  const result: DocType[] = [];
  for (const group of DOCS_BY_STATUS) {
    if (!group.minStatus || item.status === group.minStatus || item.status === "completed") {
      result.push(...group.types);
    }
  }
  // dedupe
  return [...new Set(result)];
}

export default function DocumentTracker({ dealId }: { dealId: string }) {
  const [items, setItems] = useState<RehabItem[]>([]);
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [itemsRes, docsRes] = await Promise.all([
        fetch(`/api/deals/${dealId}/rehab-items`),
        fetch(`/api/deals/${dealId}/documents`),
      ]);
      if (!itemsRes.ok || !docsRes.ok) throw new Error("Failed to load documents");
      const { items: itemData } = await itemsRes.json();
      const { documents: docData } = await docsRes.json();
      setItems(itemData);
      setDocs(docData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const docsByItem = useMemo(() => {
    const map = new Map<string, DocumentRow[]>();
    for (const doc of docs) {
      if (!doc.rehab_item_id) continue;
      const list = map.get(doc.rehab_item_id) ?? [];
      list.push(doc);
      map.set(doc.rehab_item_id, list);
    }
    return map;
  }, [docs]);

  const updateStatus = async (doc: DocumentRow, status: DocStatus) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update document");
    }
  };

  // Generate a document record for a (item, type) pair if it doesn't exist yet.
  const ensureDoc = async (item: RehabItem, type: DocType) => {
    try {
      const res = await fetch(`/api/deals/${dealId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rehab_item_id: item.id,
          doc_type: type,
          status: "missing",
        }),
      });
      if (res.ok) fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create document");
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading document tracker…</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Document Tracker</h2>
          <p className="text-sm text-zinc-500">
            Per-rehab-item document checklist. Generated lien waivers are drafts — not legal advice.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-400">
          Add rehab items first — documents are tracked per line item.
        </p>
      ) : (
        <div className="space-y-5">
          {items.map((item) => {
            const existing = docsByItem.get(item.id) ?? [];
            const needed = docsForItem(item);
            return (
              <div key={item.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{item.description}</p>
                    <p className="text-xs text-zinc-500">{item.trade} · {item.status}</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                        <th className="px-2 py-1.5">Document</th>
                        <th className="px-2 py-1.5">Required when</th>
                        <th className="px-2 py-1.5">Status</th>
                        <th className="px-2 py-1.5">Requested</th>
                        <th className="px-2 py-1.5">Received</th>
                        <th className="px-2 py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {needed.map((type) => {
                        const doc = existing.find((d) => d.doc_type === type);
                        const overdue = doc ? isOverdue(doc) : false;
                        return (
                          <tr
                            key={type}
                            className={`border-b border-zinc-100 last:border-0 ${overdue ? "bg-red-50/60" : ""}`}
                          >
                            <td className="px-2 py-2">
                              <p className="font-medium text-zinc-800">{DOC_TYPE_LABELS[type]}</p>
                              <p className="text-[10px] text-zinc-400">{DOC_TYPE_DESC[type]}</p>
                            </td>
                            <td className="px-2 py-2 text-xs text-zinc-500">{DOC_TYPE_DESC[type]}</td>
                            <td className="px-2 py-2">
                              {doc ? (
                                <div className="flex items-center gap-2">
                                  <select
                                    value={doc.status}
                                    onChange={(e) => updateStatus(doc, e.target.value as DocStatus)}
                                    className={`rounded px-2 py-1 text-xs font-medium ${statusBadge[doc.status]}`}
                                  >
                                    <option value="missing">Missing</option>
                                    <option value="requested">Requested</option>
                                    <option value="received">Received</option>
                                    <option value="filed">Filed</option>
                                  </select>
                                  {overdue ? (
                                    <span className="text-[10px] font-semibold text-red-600">OVERDUE</span>
                                  ) : null}
                                </div>
                              ) : (
                                <button
                                  onClick={() => ensureDoc(item, type)}
                                  className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200"
                                >
                                  Add
                                </button>
                              )}
                            </td>
                            <td className="px-2 py-2 text-xs text-zinc-500">
                              {doc?.requested_at ?? "—"}
                            </td>
                            <td className="px-2 py-2 text-xs text-zinc-500">
                              {doc?.received_at ?? "—"}
                            </td>
                            <td className="px-2 py-2 text-right">
                              {doc?.doc_type === "conditional_lien_waiver" ||
                              doc?.doc_type === "unconditional_lien_waiver" ? (
                                <a
                                  href={`/api/documents/generate-lien-waiver/${doc.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200"
                                >
                                  <FileDown className="h-3 w-3" /> PDF
                                </a>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
