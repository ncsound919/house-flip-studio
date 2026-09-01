"use client";

import { useEffect, useState } from "react";
import type { EntityDocumentRow, EntityDocType, EntityDocStatus } from "@/app/api/entity-documents/route";

const DOC_TYPES: { type: EntityDocType; label: string; hint: string }[] = [
  { type: "operating_agreement", label: "Operating Agreement", hint: "LLC formation documents" },
  { type: "ein_letter", label: "EIN Letter", hint: "IRS confirmation" },
  { type: "business_license", label: "Business License", hint: "State / local licensing" },
  { type: "insurance_cert", label: "Insurance Certificates", hint: "General liability, property" },
  { type: "banking_agreement", label: "Banking Relationship", hint: "Business account, credit history" },
  { type: "tax_return", label: "Tax Returns", hint: "Entity + personal, 2 years" },
  { type: "financial_statement", label: "Financial Statements", hint: "P&L, balance sheet, cash flow" },
  { type: "other", label: "Other", hint: "" },
];

const STATUS_ORDER: EntityDocStatus[] = ["missing", "requested", "received", "filed"];

const STATUS_LABELS: Record<EntityDocStatus, string> = {
  missing: "Missing",
  requested: "Requested",
  received: "Received",
  filed: "Filed",
};

export default function EntityVault() {
  const [docs, setDocs] = useState<EntityDocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDocs = async () => {
    try {
      const res = await fetch("/api/entity-documents");
      if (!res.ok) throw new Error("Failed to load entity documents");
      const { documents } = await res.json();
      setDocs(documents);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, []);

  const updateStatus = async (id: string, status: EntityDocStatus) => {
    try {
      await fetch(`/api/entity-documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await fetchDocs();
    } catch {
      // ignore
    }
  };

  const removeDoc = async (id: string) => {
    try {
      await fetch(`/api/entity-documents/${id}`, { method: "DELETE" });
      await fetchDocs();
    } catch {
      // ignore
    }
  };

  const addDoc = async (type: EntityDocType) => {
    try {
      await fetch("/api/entity-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_type: type, status: "missing" }),
      });
      await fetchDocs();
    } catch {
      // ignore
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading entity vault…</p>;

  const docFor = (type: EntityDocType) => docs.find((d) => d.doc_type === type);

  return (
    <div>
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <p className="mb-5 text-sm text-zinc-500">
        The documents a lender or capital partner asks for. Each item tracks its status; use the arrows to move it forward. Links go in the notes field.
      </p>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {DOC_TYPES.map((docType, i) => {
          const doc = docFor(docType.type);
          return (
            <div key={docType.type} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-zinc-100" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-900">{docType.label}</p>
                <p className="text-xs text-zinc-500">{docType.hint}</p>
                {doc?.notes ? <p className="mt-0.5 truncate text-xs text-zinc-400">{doc.notes}</p> : null}
              </div>
              {doc ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center overflow-hidden rounded-lg border border-zinc-200">
                    {STATUS_ORDER.map((s, idx) => (
                      <button
                        key={s}
                        onClick={() => updateStatus(doc.id, s)}
                        title={`Set to ${STATUS_LABELS[s]}`}
                        className={`px-2 py-1 text-xs font-medium ${
                          doc.status === s
                            ? s === "received" || s === "filed"
                              ? "bg-emerald-600 text-white"
                              : "bg-zinc-900 text-white"
                            : "bg-white text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                        }`}
                      >
                        {idx + 1}
                      </button>
                    ))}
                  </div>
                  <span className={`w-20 text-xs font-medium ${doc.status === "missing" ? "text-red-600" : "text-zinc-600"}`}>
                    {STATUS_LABELS[doc.status]}
                  </span>
                  <button onClick={() => removeDoc(doc.id)} className="text-xs font-medium text-red-600 hover:text-red-700">
                    Remove
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => addDoc(docType.type)}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  Track
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
