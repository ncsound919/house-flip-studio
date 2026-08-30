"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type ChangeOrder,
  type Contractor,
  type RehabItem,
  REHAB_TRADES,
} from "@/lib/types";

const STATUS_BADGES: Record<RehabItem["status"], string> = {
  estimated: "bg-zinc-100 text-zinc-700",
  contracted: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
};

const STATUS_LABELS: Record<RehabItem["status"], string> = {
  estimated: "Estimated",
  contracted: "Contracted",
  in_progress: "In Progress",
  completed: "Completed",
};

const CO_STATUS_BADGES: Record<ChangeOrder["status"], string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

const STATUS_OPTIONS: RehabItem["status"][] = [
  "estimated",
  "contracted",
  "in_progress",
  "completed",
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function contractrorMatchScore(c: Contractor, trade: string) {
  if (!c.trade) return 0;
  const ct = c.trade.toLowerCase();
  const t = trade.toLowerCase();
  if (ct === t) return 3;
  if (ct.includes(t) || t.includes(ct)) return 2;
  return 1;
}

export default function RehabBudget({
  dealId,
  orgId,
  contractors,
}: {
  dealId: string;
  orgId: string;
  contractors: Contractor[];
}) {
  void orgId;
  const [items, setItems] = useState<RehabItem[]>([]);
  const [changeOrders, setChangeOrders] = useState<Record<string, ChangeOrder[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/deals/${dealId}/rehab-items`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load line items");
      }
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (dealId) fetchItems();
  }, [dealId]);

  const fetchChangeOrders = async (itemId: string) => {
    try {
      const res = await fetch(
        `/api/deals/${dealId}/change-orders?rehab_item_id=${itemId}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load change orders");
      }
      const data = await res.json();
      setChangeOrders((prev) => ({ ...prev, [itemId]: data.changeOrders || [] }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load change orders");
    }
  };

  const handleAdd = async (form: NewItemForm) => {
    const optimistic: RehabItem = {
      id: `tmp-${Date.now()}`,
      deal_id: dealId,
      trade: form.trade,
      description: form.description,
      contractor_id: form.contractor_id || null,
      estimated_cost: form.estimated_cost,
      actual_cost: 0,
      status: "estimated",
      notes: form.notes || null,
      created_at: new Date().toISOString(),
      contractors: contractors.find((c) => c.id === form.contractor_id) || null,
    };
    setItems((prev) => [...prev, optimistic]);
    setShowAdd(false);

    try {
      const res = await fetch(`/api/deals/${dealId}/rehab-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add item");
      }
      const data = await res.json();
      setItems((prev) =>
        prev.map((i) => (i.id === optimistic.id ? (data.item as RehabItem) : i))
      );
    } catch (e) {
      setItems((prev) => prev.filter((i) => i.id !== optimistic.id));
      setError(e instanceof Error ? e.message : "Failed to add item");
    }
  };

  const handleUpdate = async (id: string, updates: Partial<RehabItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
    setEditingId(null);

    try {
      const res = await fetch(`/api/deals/${dealId}/rehab-items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update item");
      }
      const data = await res.json();
      setItems((prev) =>
        prev.map((i) => (i.id === id ? (data.item as RehabItem) : i))
      );
    } catch (e) {
      await fetchItems();
      setError(e instanceof Error ? e.message : "Failed to update item");
    }
  };

  const handleStatusChange = async (id: string, status: RehabItem["status"]) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    try {
      const res = await fetch(`/api/deals/${dealId}/rehab-items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update status");
      }
    } catch (e) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "estimated" } : i)));
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  };

  const handleDelete = async (id: string) => {
    const removed = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDeleteId(null);

    try {
      const res = await fetch(`/api/deals/${dealId}/rehab-items/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
    } catch (e) {
      if (removed) setItems((prev) => [...prev, removed].sort((a, b) => a.created_at.localeCompare(b.created_at)));
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const handleAddChangeOrder = async (
    itemId: string,
    payload: { description: string; cost_impact: number; reason: string }
  ) => {
    const tempId = `tmp-co-${Date.now()}`;
    const optimistic: ChangeOrder = {
      id: tempId,
      rehab_item_id: itemId,
      description: payload.description,
      cost_impact: payload.cost_impact,
      reason: payload.reason || null,
      status: "pending",
      created_at: new Date().toISOString(),
    };
    setChangeOrders((prev) => ({
      ...prev,
      [itemId]: [...(prev[itemId] || []), optimistic],
    }));

    try {
      const res = await fetch(`/api/deals/${dealId}/change-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, rehab_item_id: itemId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to add change order");
      }
      const data = await res.json();
      setChangeOrders((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] || []).map((co) =>
          co.id === tempId ? (data.changeOrder as ChangeOrder) : co
        ),
      }));
    } catch (e) {
      setChangeOrders((prev) => ({
        ...prev,
        [itemId]: (prev[itemId] || []).filter((co) => co.id !== tempId),
      }));
      setError(e instanceof Error ? e.message : "Failed to add change order");
    }
  };

  const handleUpdateChangeOrder = async (
    itemId: string,
    coId: string,
    status: ChangeOrder["status"]
  ) => {
    setChangeOrders((prev) => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map((co) =>
        co.id === coId ? { ...co, status } : co
      ),
    }));
    try {
      const res = await fetch(`/api/deals/${dealId}/change-orders/${coId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update");
      }
    } catch (e) {
      await fetchChangeOrders(itemId);
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  };

  const handleDeleteChangeOrder = async (itemId: string, coId: string) => {
    const prev = changeOrders[itemId] || [];
    setChangeOrders((p) => ({
      ...p,
      [itemId]: prev.filter((co) => co.id !== coId),
    }));
    try {
      const res = await fetch(`/api/deals/${dealId}/change-orders/${coId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete");
      }
    } catch (e) {
      setChangeOrders((p) => ({ ...p, [itemId]: prev }));
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  };

  const toggleExpand = (itemId: string) => {
    if (expandedId === itemId) {
      setExpandedId(null);
    } else {
      setExpandedId(itemId);
      if (!changeOrders[itemId]) {
        void fetchChangeOrders(itemId);
      }
    }
  };

  const totals = useMemo(() => {
    const totalEst = items.reduce((s, i) => s + (i.estimated_cost || 0), 0);
    const totalAct = items.reduce((s, i) => s + (i.actual_cost || 0), 0);
    return {
      est: totalEst,
      act: totalAct,
      variance: totalEst - totalAct,
    };
  }, [items]);

  const progressPct = totals.est > 0 ? Math.min(100, (totals.act / totals.est) * 100) : 0;
  const overBudget = totals.est > 0 && totals.act > totals.est;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">Rehab Budget</h2>
          <p className="text-sm text-zinc-500">
            {items.length} {items.length === 1 ? "line item" : "line items"}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Add Line Item
        </button>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="mb-4 rounded-xl bg-zinc-50 p-3">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <span className="font-medium text-zinc-700">Budget progress</span>
          <span className={overBudget ? "font-semibold text-red-700" : "text-zinc-600"}>
            {fmt(totals.act)} / {fmt(totals.est)}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-zinc-200">
          <div
            className={`h-full transition-all ${overBudget ? "bg-red-500" : "bg-blue-600"}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        {overBudget ? (
          <p className="mt-1 text-xs font-medium text-red-700">
            Over budget by {fmt(totals.act - totals.est)}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-10 text-center text-sm text-zinc-500">
          No line items yet. Add your first line item to start tracking the rehab budget.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-2">Trade</th>
                  <th className="py-2 pr-2">Description</th>
                  <th className="py-2 pr-2">Contractor</th>
                  <th className="py-2 pr-2 text-right">Estimated</th>
                  <th className="py-2 pr-2 text-right">Actual</th>
                  <th className="py-2 pr-2 text-right">Variance</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const variance = (item.estimated_cost || 0) - (item.actual_cost || 0);
                  const isExpanded = expandedId === item.id;
                  const cos = changeOrders[item.id] || [];
                  const cosTotal = cos.reduce(
                    (s, co) => (co.status === "approved" ? s + (co.cost_impact || 0) : s),
                    0
                  );

                  return (
                    <>
                      <tr
                        key={item.id}
                        className="border-b border-zinc-100 align-top hover:bg-zinc-50"
                      >
                        <td className="py-3 pr-2 text-zinc-900">{item.trade}</td>
                        <td className="py-3 pr-2 text-zinc-700">
                          {item.description}
                          {item.notes ? (
                            <p className="mt-1 text-xs text-zinc-500">{item.notes}</p>
                          ) : null}
                        </td>
                        <td className="py-3 pr-2 text-zinc-700">
                          {item.contractors?.name || "—"}
                        </td>
                        <td className="py-3 pr-2 text-right tabular-nums text-zinc-900">
                          {fmt(item.estimated_cost)}
                        </td>
                        <td className="py-3 pr-2 text-right tabular-nums">
                          <input
                            type="number"
                            min="0"
                            value={item.actual_cost}
                            onChange={(e) =>
                              setItems((prev) =>
                                prev.map((i) =>
                                  i.id === item.id
                                    ? { ...i, actual_cost: Number(e.target.value) || 0 }
                                    : i
                                )
                              )
                            }
                            onBlur={(e) =>
                              handleUpdate(item.id, {
                                actual_cost: Number(e.target.value) || 0,
                              })
                            }
                            className="w-24 rounded border border-zinc-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
                          />
                        </td>
                        <td
                          className={`py-3 pr-2 text-right tabular-nums ${
                            variance < 0
                              ? "font-semibold text-red-700"
                              : variance > 0
                              ? "text-green-700"
                              : "text-zinc-500"
                          }`}
                        >
                          {fmt(variance)}
                        </td>
                        <td className="py-3 pr-2">
                          <select
                            value={item.status}
                            onChange={(e) =>
                              handleStatusChange(
                                item.id,
                                e.target.value as RehabItem["status"]
                              )
                            }
                            className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_BADGES[item.status]}`}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 pr-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                              title="Change orders"
                            >
                              {isExpanded ? "Hide" : `COs${cos.length ? ` (${cos.length})` : ""}`}
                            </button>
                            <button
                              onClick={() => setEditingId(item.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => setDeleteId(item.id)}
                              className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded ? (
                        <tr key={`${item.id}-co`} className="border-b border-zinc-100 bg-zinc-50">
                          <td colSpan={8} className="px-2 py-3">
                            <ChangeOrdersPanel
                              item={item}
                              changeOrders={cos}
                              cosTotal={cosTotal}
                              onAdd={(p) => handleAddChangeOrder(item.id, p)}
                              onUpdateStatus={(coId, status) =>
                                handleUpdateChangeOrder(item.id, coId, status)
                              }
                              onDelete={(coId) => handleDeleteChangeOrder(item.id, coId)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
                <tr className="bg-zinc-50 font-semibold text-zinc-900">
                  <td className="py-3 pr-2" colSpan={3}>
                    Totals
                  </td>
                  <td className="py-3 pr-2 text-right tabular-nums">{fmt(totals.est)}</td>
                  <td className="py-3 pr-2 text-right tabular-nums">{fmt(totals.act)}</td>
                  <td
                    className={`py-3 pr-2 text-right tabular-nums ${
                      totals.variance < 0
                        ? "text-red-700"
                        : totals.variance > 0
                        ? "text-green-700"
                        : "text-zinc-500"
                    }`}
                  >
                    {fmt(totals.variance)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {showAdd ? (
        <ItemFormModal
          contractors={contractors}
          onClose={() => setShowAdd(false)}
          onSubmit={handleAdd}
        />
      ) : null}

      {editingId ? (
        <ItemFormModal
          contractors={contractors}
          existing={items.find((i) => i.id === editingId) || null}
          onClose={() => setEditingId(null)}
          onSubmit={(form) => handleUpdate(editingId, form)}
        />
      ) : null}

      {deleteId ? (
        <ConfirmDialog
          message="Delete this line item? This will also remove all change orders attached to it."
          onCancel={() => setDeleteId(null)}
          onConfirm={() => handleDelete(deleteId)}
        />
      ) : null}
    </section>
  );
}

interface NewItemForm {
  trade: string;
  description: string;
  contractor_id: string | null;
  estimated_cost: number;
  notes: string;
}

function ItemFormModal({
  contractors,
  existing,
  onClose,
  onSubmit,
}: {
  contractors: Contractor[];
  existing?: RehabItem | null;
  onClose: () => void;
  onSubmit: (form: NewItemForm) => void;
}) {
  const [trade, setTrade] = useState(existing?.trade || REHAB_TRADES[0]);
  const [description, setDescription] = useState(existing?.description || "");
  const [contractorId, setContractorId] = useState(existing?.contractor_id || "");
  const [estimatedCost, setEstimatedCost] = useState(
    existing ? String(existing.estimated_cost || 0) : ""
  );
  const [notes, setNotes] = useState(existing?.notes || "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rankedContractors = useMemo(() => {
    return [...contractors]
      .map((c) => ({ c, score: contractrorMatchScore(c, trade) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  }, [contractors, trade]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (!description.trim()) {
        setError("Description is required");
        return;
      }
      const est = Number(estimatedCost);
      if (isNaN(est) || est < 0) {
        setError("Estimated cost must be a non-negative number");
        return;
      }
      onSubmit({
        trade,
        description: description.trim(),
        contractor_id: contractorId || null,
        estimated_cost: est,
        notes: notes.trim(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-zinc-900">
          {existing ? "Edit Line Item" : "Add Line Item"}
        </h2>
        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : null}
        <form onSubmit={handleSubmit} className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Trade *
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {REHAB_TRADES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Contractor
            <select
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">— None —</option>
              {rankedContractors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.trade ? `(${c.trade})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Description *
            <input
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Estimated cost *
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-sm font-medium text-zinc-700">
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </label>

          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {existing ? "Save" : "Add Item"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({
  message,
  onCancel,
  onConfirm,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-zinc-900">Confirm</h2>
        <p className="mt-2 text-sm text-zinc-600">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangeOrdersPanel({
  item,
  changeOrders,
  cosTotal,
  onAdd,
  onUpdateStatus,
  onDelete,
}: {
  item: RehabItem;
  changeOrders: ChangeOrder[];
  cosTotal: number;
  onAdd: (p: { description: string; cost_impact: number; reason: string }) => void;
  onUpdateStatus: (coId: string, status: ChangeOrder["status"]) => void;
  onDelete: (coId: string) => void;
}) {
  const [description, setDescription] = useState("");
  const [costImpact, setCostImpact] = useState("");
  const [reason, setReason] = useState("");

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cost = Number(costImpact);
    if (!description.trim() || isNaN(cost)) return;
    onAdd({ description: description.trim(), cost_impact: cost, reason: reason.trim() });
    setDescription("");
    setCostImpact("");
    setReason("");
  };

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          Change Orders — {item.description}
        </h3>
        <span className="text-xs text-zinc-500">
          Approved impact: {fmt(cosTotal)}
        </span>
      </div>

      {changeOrders.length === 0 ? (
        <p className="mb-3 text-xs text-zinc-500">No change orders yet.</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {changeOrders.map((co) => (
            <li
              key={co.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">{co.description}</p>
                {co.reason ? (
                  <p className="text-xs text-zinc-500">{co.reason}</p>
                ) : null}
                <p
                  className={`mt-1 text-xs font-semibold ${
                    (co.cost_impact || 0) > 0 ? "text-red-700" : "text-green-700"
                  }`}
                >
                  {fmt(co.cost_impact)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={co.status}
                  onChange={(e) =>
                    onUpdateStatus(co.id, e.target.value as ChangeOrder["status"])
                  }
                  className={`rounded-full px-2 py-1 text-xs font-medium ${CO_STATUS_BADGES[co.status]}`}
                >
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
                <button
                  type="button"
                  onClick={() => onDelete(co.id)}
                  className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        onSubmit={handleAdd}
        className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_1fr_auto]"
      >
        <input
          required
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          required
          type="number"
          step="0.01"
          placeholder="Cost impact"
          value={costImpact}
          onChange={(e) => setCostImpact(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <input
          placeholder="Reason (optional)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Add CO
        </button>
      </form>
    </div>
  );
}
