"use client";

import { useState } from "react";

export interface Contractor {
  id: string;
  org_id?: string;
  name: string;
  trade: string;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  license_board: string | null;
  license_tier: string | null;
  insurance_policy: string | null;
  insurance_expiry: string | null;
  insurance_limit: string | null;
  workers_comp_verified: boolean;
  w9_on_file: boolean;
  notes: string | null;
  status: "active" | "available" | "completed";
  created_at?: string;
}

const TRADES = [
  "General Contracting",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Roofing",
  "Structural",
  "Interior",
  "Exterior",
  "Specialty Trade",
];

const LICENSE_TIERS = [
  "Unlimited GC",
  "Intermediate GC",
  "Limited GC",
  "Master Electrician",
  "Master Plumber",
  "HVAC Class I",
  "Specialty Trade",
  "Punchout Handyman",
];

const STATUSES = ["active", "available", "completed"] as const;

interface ContractorFormProps {
  contractor?: Contractor | null;
  onSave: (c: Contractor) => void;
  onCancel: () => void;
}

export default function ContractorForm({
  contractor,
  onSave,
  onCancel,
}: ContractorFormProps) {
  const [name, setName] = useState(contractor?.name ?? "");
  const [trade, setTrade] = useState(contractor?.trade ?? "");
  const [phone, setPhone] = useState(contractor?.phone ?? "");
  const [email, setEmail] = useState(contractor?.email ?? "");
  const [licenseNumber, setLicenseNumber] = useState(contractor?.license_number ?? "");
  const [licenseBoard, setLicenseBoard] = useState(
    contractor?.license_board ?? "NC State Licensing Board for General Contractors"
  );
  const [licenseTier, setLicenseTier] = useState(contractor?.license_tier ?? "");
  const [insurancePolicy, setInsurancePolicy] = useState(contractor?.insurance_policy ?? "");
  const [insuranceExpiry, setInsuranceExpiry] = useState(contractor?.insurance_expiry ?? "");
  const [insuranceLimit, setInsuranceLimit] = useState(contractor?.insurance_limit ?? "");
  const [workersComp, setWorkersComp] = useState(contractor?.workers_comp_verified ?? false);
  const [w9OnFile, setW9OnFile] = useState(contractor?.w9_on_file ?? false);
  const [notes, setNotes] = useState(contractor?.notes ?? "");
  const [status, setStatus] = useState<Contractor["status"]>(contractor?.status ?? "active");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!contractor?.id;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!trade) {
      setError("Trade is required");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        trade,
        phone: phone || null,
        email: email || null,
        license_number: licenseNumber || null,
        license_board: licenseBoard || null,
        license_tier: licenseTier || null,
        insurance_policy: insurancePolicy || null,
        insurance_expiry: insuranceExpiry || null,
        insurance_limit: insuranceLimit || null,
        workers_comp_verified: workersComp,
        w9_on_file: w9OnFile,
        notes: notes || null,
        status,
      };

      const res = await fetch(
        isEdit ? `/api/contractors/${contractor!.id}` : "/api/contractors",
        {
          method: isEdit ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Failed to save contractor");
      }
      onSave(json.contractor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
  const labelClass = "block text-sm font-medium text-zinc-700 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>
            Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            required
          />
        </div>
        <div>
          <label className={labelClass}>
            Trade <span className="text-red-500">*</span>
          </label>
          <select
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Select a trade</option>
            {TRADES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>License Number</label>
          <input
            type="text"
            value={licenseNumber}
            onChange={(e) => setLicenseNumber(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>License Board</label>
          <input
            type="text"
            value={licenseBoard}
            onChange={(e) => setLicenseBoard(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>License Tier</label>
          <select
            value={licenseTier}
            onChange={(e) => setLicenseTier(e.target.value)}
            className={inputClass}
          >
            <option value="">None</option>
            {LICENSE_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Contractor["status"])}
            className={inputClass}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Insurance Policy</label>
          <input
            type="text"
            value={insurancePolicy}
            onChange={(e) => setInsurancePolicy(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Insurance Expiry</label>
          <input
            type="date"
            value={insuranceExpiry ?? ""}
            onChange={(e) => setInsuranceExpiry(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Insurance Limit</label>
          <input
            type="text"
            placeholder="$2,000,000 / $4,000,000"
            value={insuranceLimit}
            onChange={(e) => setInsuranceLimit(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="md:col-span-2 flex gap-6">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={workersComp}
              onChange={(e) => setWorkersComp(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
            />
            Workers Comp Verified
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={w9OnFile}
              onChange={(e) => setW9OnFile(e.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
            />
            W-9 on File
          </label>
        </div>
        <div className="md:col-span-2">
          <label className={labelClass}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? "Saving..." : isEdit ? "Update Contractor" : "Add Contractor"}
        </button>
      </div>
    </form>
  );
}
