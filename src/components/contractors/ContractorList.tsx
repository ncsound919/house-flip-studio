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

type VerifyState = {
  loading: boolean;
  verified?: boolean;
  checked_at?: string;
  detail?: string;
};

type RfqModalState = {
  contractor: Contractor;
  loading: boolean;
  draft?: string;
  error?: string;
};

export default function ContractorList() {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Contractor | null>(null);
  const [search, setSearch] = useState("");
  const [filterTrade, setFilterTrade] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [verifyById, setVerifyById] = useState<Record<string, VerifyState>>({});
  const [rfqModal, setRfqModal] = useState<RfqModalState | null>(null);

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

  async function handleVerify(c: Contractor) {
    if (!c.license_number) return;
    setVerifyById((prev) => ({ ...prev, [c.id]: { loading: true } }));
    try {
      const res = await fetch("/api/contractors/verify-license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractor_id: c.id }),
      });
      const json = await res.json();
      if (json.verified) {
        const checkedAt: string = json.checked_at ?? new Date().toISOString();
        setContractors((prev) =>
          prev.map((x) => (x.id === c.id ? { ...x, verified_at: checkedAt } : x))
        );
        setVerifyById((prev) => ({
          ...prev,
          [c.id]: {
            loading: false,
            verified: true,
            checked_at: checkedAt,
            detail: json.detail ?? "License verified as Active on nclbgc.org",
          },
        }));
      } else {
        const detail: string = json.reason ?? json.detail ?? "nclbgc unavailable, verify manually";
        setVerifyById((prev) => ({
          ...prev,
          [c.id]: {
            loading: false,
            verified: false,
            checked_at: json.checked_at,
            detail,
          },
        }));
      }
    } catch {
      setVerifyById((prev) => ({
        ...prev,
        [c.id]: {
          loading: false,
          verified: false,
          detail: "nclbgc unavailable, verify manually",
        },
      }));
    }
  }

  async function handleGenerateRfq(c: Contractor) {
    setRfqModal({ contractor: c, loading: true });
    try {
      const res = await fetch("/api/contractors/generate-rfq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractor_id: c.id }),
      });
      if (res.status === 404) {
        setRfqModal({
          contractor: c,
          loading: false,
          error: "RFQ generation not yet available — coming next",
        });
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg: string = json.error ?? json.reason ?? "";
        const isDealMissing =
          msg.toLowerCase().includes("deal_id") ||
          msg.toLowerCase().includes("deal") ||
          res.status === 400;
        setRfqModal({
          contractor: c,
          loading: false,
          error: isDealMissing
            ? "Open a deal's Rehab tab to generate an RFQ for this contractor"
            : msg || "RFQ generation not yet available — coming next",
        });
        return;
      }
      if (json.draft_text) {
        setRfqModal({ contractor: c, loading: false, draft: json.draft_text });
      } else {
        setRfqModal({
          contractor: c,
          loading: false,
          error: "RFQ generation not yet available — coming next",
        });
      }
    } catch {
      setRfqModal({
        contractor: c,
        loading: false,
        error: "RFQ generation not yet available — coming next",
      });
    }
  }

  const trades = [...new Set(contractors.map((c) => c.trade))].sort();

  const filtered = contractors.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.trade.toLowerCase().includes(q) ||
      (c.phone ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.license_number ?? "").toLowerCase().includes(q)
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

      {/* Search-first: prominent trade + license text input at the top above filters */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm mb-4">
        <label htmlFor="contractor-search" className="block text-sm font-medium text-zinc-700 mb-1.5">
          Search contractors
        </label>
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            id="contractor-search"
            type="text"
            placeholder="Search by trade, license number, name, phone, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white pl-9 pr-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">Tip: type a trade like &quot;Electrical&quot; or a license number to filter.</p>
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
          {filtered.map((c) => {
            const vs = verifyById[c.id];
            const hasLicense = !!c.license_number?.trim();
            const persistedVerifiedAt = (c as Contractor).verified_at;
            return (
              <div key={c.id} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm flex flex-col">
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
                      <a href={`mailto:${c.email}`} className="hover:text-indigo-600 truncate">
                        {c.email}
                      </a>
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

                {/* Verify license status area — honesty guardrails: no silent green */}
                <div className="min-h-[22px] mb-3">
                  {vs?.loading ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Verifying...
                    </span>
                  ) : vs?.verified ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Verified {vs.checked_at ? `· ${new Date(vs.checked_at).toLocaleString()}` : ""}
                    </span>
                  ) : vs?.verified === false ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a1 1 0 00.86 1.5h18.64a1 1 0 00.86-1.5L13.71 3.86a1 1 0 00-1.72 0z" />
                      </svg>
                      <span className="truncate">{vs.detail ?? "nclbgc unavailable, verify manually"}</span>
                    </span>
                  ) : persistedVerifiedAt ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-green-700">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Verified · {new Date(persistedVerifiedAt).toLocaleString()}
                    </span>
                  ) : null}
                </div>

                {c.notes && <p className="text-xs text-zinc-500 mb-3 line-clamp-2">{c.notes}</p>}

                <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3 mt-auto">
                  <button
                    onClick={() => handleVerify(c)}
                    disabled={!hasLicense || vs?.loading}
                    title={!hasLicense ? "Add a license number to verify" : undefined}
                    className="inline-flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {vs?.loading ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    Verify license
                  </button>
                  <button
                    onClick={() => handleGenerateRfq(c)}
                    className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Generate RFQ
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    className="rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-zinc-900 mb-4">{editing ? "Edit Contractor" : "Add Contractor"}</h2>
            <ContractorForm contractor={editing} onSave={handleSave} onCancel={closeForm} />
          </div>
        </div>
      )}

      {rfqModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h2 className="text-base font-semibold text-zinc-900">RFQ — {rfqModal.contractor.name}</h2>
              <button
                onClick={() => setRfqModal(null)}
                className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {rfqModal.loading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-zinc-500">
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
                Generating draft...
              </div>
            ) : rfqModal.error ? (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">{rfqModal.error}</div>
            ) : rfqModal.draft ? (
              <div className="space-y-3">
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {rfqModal.draft}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(rfqModal.draft ?? "");
                    }}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                  >
                    Copy
                  </button>
                  {rfqModal.contractor.email && (
                    <a
                      href={`mailto:${rfqModal.contractor.email}?subject=${encodeURIComponent(`RFQ — ${rfqModal.contractor.trade}`)}&body=${encodeURIComponent(rfqModal.draft ?? "")}`}
                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      Open mailto
                    </a>
                  )}
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setRfqModal(null)}
                className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
