"use client";

import { useState, useEffect, useCallback } from "react";
import ContractorForm, { type Contractor } from "./ContractorForm";

const TRADE_COLORS: Record<string, string> = {
  "General Contracting": "bg-indigo-100 text-indigo-800",
  Electrical: "bg-amber-100 text-amber-800",
  Plumbing: "bg-blue-100 text-blue-800",
  HVAC: "bg-cyan-100 text-cyan-800",
  Roofing: "bg-orange-100 text-orange-800",
  Structural: "bg-red-100 text-red-800",
  Interior: "bg-purple-100 text-purple-800",
  Exterior: "bg-green-100 text-green-800",
  "Specialty Trade": "bg-gray-100 text-gray-800",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  available: "bg-blue-100 text-blue-800",
  completed: "bg-gray-100 text-gray-800",
};

function VerificationBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <span title="Verified" className="inline-flex items-center gap-0.5 text-green-600 text-xs">
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
      Verified
    </span>
  ) : (
    <span title="Not verified" className="inline-flex items-center gap-0.5 text-zinc-400 text-xs">
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
      Unverified
    </span>
  );
}

export default function ContractorList() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const fetchContractors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterTrade) params.set("trade", filterTrade);
      if (filterStatus) params.set("status", filterStatus);
      const url = `/api/contractors${params.size ? `?${params}` : ""}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load");
      setContractors(json.contractors);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contractors");
    } finally {
      setLoading(false);
    }
  }, [filterTrade, filterStatus]);

  useEffect(() => {
    fetchContractors();
  }, [fetchContractors]);

  function handleSave(saved: Contractor) {
    setContractors((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [saved, ...prev];
    });
    setShowForm(false);
    setEditing(null);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this contractor?")) return;
    fetch(`/api/contractors/${id}`, { method: "DELETE" })
      .then((r) => r.json())
      .then(() => setContractors((prev) => prev.filter((c) => c.id !== id)))
      .catch(() => alert("Failed to delete"));
  }

  function openEdit(c: Contractor) {
    setEditing(c);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditing(null);
  }

  const trades = [...new Set(contractors.map((c) => c.trade))].sort();

  const filtered = contractors.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.trade.toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q) ||
      (c.email ?? "").includes(q)
    );
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold text-zinc-900">Contractors</h1>
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add Contractor
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by name, trade, phone, email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <span className="text-sm text-zinc-500 self-center">Trade:</span>
        <button
          onClick={() => setFilterTrade("")}
          className={`rounded-full px-3 py-0.5 text-xs font-medium ${
            !filterTrade ? "bg-indigo-100 text-indigo-800" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
          }`}
        >
          All
        </button>
        {trades.map((t) => (
          <button
            key={t}
            onClick={() => setFilterTrade(filterTrade === t ? "" : t)}
            className={`rounded-full px-3 py-0.5 text-xs font-medium ${
              filterTrade === t ? TRADE_COLORS[t] ?? "bg-indigo-100 text-indigo-800" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {t}
          </button>
        ))}
        <span className="text-sm text-zinc-500 self-center ml-2">Status:</span>
        {(["active", "available", "completed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(filterStatus === s ? "" : s)}
            className={`rounded-full px-3 py-0.5 text-xs font-medium ${
              filterStatus === s ? STATUS_COLORS[s] : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-zinc-400">Loading...</div>
      ) : error ? (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-zinc-200 py-16 text-center">
          <p className="text-zinc-500">No contractors yet. Add your first contractor to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-semibold text-zinc-900 leading-tight">{c.name}</h3>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-800"
                  }`}
                >
                  {c.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TRADE_COLORS[c.trade] ?? "bg-gray-100 text-gray-800"}`}>
                  {c.trade}
                </span>
                {c.license_tier && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {c.license_tier}
                  </span>
                )}
              </div>

              <div className="space-y-1 text-sm text-zinc-600 mb-3">
                {c.phone && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {c.phone}
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <a href={`mailto:${c.email}`} className="hover:text-indigo-600 truncate">{c.email}</a>
                  </div>
                )}
                {c.license_number && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="truncate">{c.license_number}</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 mb-3 text-xs">
                <VerificationBadge verified={c.workers_comp_verified} />
                <VerificationBadge verified={c.w9_on_file} />
              </div>

              {c.notes && (
                <p className="text-xs text-zinc-500 mb-3 line-clamp-2">{c.notes}</p>
              )}

              <div className="flex gap-2 border-t border-zinc-100 pt-3">
                <button
                  onClick={() => openEdit(c)}
                  className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(c.id)}
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">
              {editing ? "Edit Contractor" : "Add Contractor"}
            </h2>
            <ContractorForm
              contractor={editing}
              onSave={handleSave}
              onCancel={closeForm}
            />
          </div>
        </div>
      )}
    </div>
  );
}
