"use client";

import { useState } from "react";
import { AlertTriangle, Sparkles, ClipboardList } from "lucide-react";
import {
  REPAIR_TRADES,
  ROOM_ZONES,
  SEVERITY_LEVELS,
  type RepairGuide,
} from "@/lib/repairGuideEngine";

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function RepairGuideForm({
  dealId,
  defaultProperty,
}: {
  dealId: string;
  defaultProperty?: { address?: string; yearBuilt?: number; sqft?: number };
}) {
  const [task, setTask] = useState("");
  const [trade, setTrade] = useState<string>(REPAIR_TRADES[0]);
  const [roomZone, setRoomZone] = useState<string>(ROOM_ZONES[0]);
  const [severity, setSeverity] = useState<string>(SEVERITY_LEVELS[1]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState<RepairGuide | null>(null);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setGuide(null);
    try {
      const res = await fetch("/api/ai/repair-guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: dealId,
          task,
          trade,
          room_zone: roomZone,
          severity,
          property: defaultProperty ?? {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setGuide(data.guide);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const applyToRehab = async () => {
    if (!guide) return;
    try {
      const res = await fetch(`/api/deals/${dealId}/rehab-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trade,
          description: guide.title,
          estimated_cost: guide.total_estimated_cost,
          status: "estimated",
          notes: `AI-generated repair guide. ${guide.disclaimer}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to add rehab item");
      alert("Added to rehab budget as an estimated line item.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add rehab item");
    }
  };

  const inputCls =
    "rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
  const labelCls = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold text-zinc-900">Repair Guide Generator</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Describe a defect to get a step-by-step repair guide with NC code citations and cost
        estimates.
      </p>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      <form onSubmit={generate} className="space-y-3">
        <label className={labelCls}>
          Task / problem description *
          <textarea
            required
            rows={3}
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="e.g. cracked floor tiles in master bath, possible subfloor water damage"
            className={inputCls}
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className={labelCls}>
            Trade
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className={`${inputCls} bg-white`}
            >
              {REPAIR_TRADES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Room / zone
            <select
              value={roomZone}
              onChange={(e) => setRoomZone(e.target.value)}
              className={`${inputCls} bg-white`}
            >
              {ROOM_ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </label>
          <label className={labelCls}>
            Severity
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className={`${inputCls} bg-white`}
            >
              {SEVERITY_LEVELS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="submit"
          disabled={loading || !task.trim()}
          className="flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {loading ? "Generating…" : "Generate Guide"}
        </button>
      </form>

      {guide ? (
        <div className="mt-5 space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{guide.disclaimer}</p>
          </div>

          <div>
            <h3 className="text-base font-semibold text-zinc-900">{guide.title}</h3>
            <p className="text-xs text-zinc-500">
              {guide.trade} · {guide.diy_feasibility}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-800">Diagnosis</p>
            <p className="text-sm text-zinc-600">{guide.problem_diagnosis}</p>
          </div>

          {guide.root_causes.length ? (
            <div>
              <p className="text-sm font-medium text-zinc-800">Root causes</p>
              <ul className="list-disc pl-5 text-sm text-zinc-600">
                {guide.root_causes.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {guide.nc_code_citations.length ? (
            <div>
              <p className="text-sm font-medium text-zinc-800">NC code citations</p>
              <ul className="space-y-1">
                {guide.nc_code_citations.map((c, i) => (
                  <li key={i} className="text-sm text-zinc-600">
                    {c.section}{" "}
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        c.citation_verified
                          ? "bg-green-50 text-green-700"
                          : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      {c.citation_verified ? "verified" : "UNVERIFIED"}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-zinc-400">
                Unverified citations were not found in the curated lookup table — confirm manually.
              </p>
            </div>
          ) : null}

          {guide.permit_required ? (
            <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">
              <span className="font-semibold">Permit required:</span> {guide.permit_type}
            </p>
          ) : null}

          <div className="rounded-lg border border-zinc-200 p-3">
            <p className="text-sm font-medium text-zinc-800">Cost estimate (AI — not a quote)</p>
            <div className="mt-1 grid grid-cols-3 gap-2 text-sm">
              <div>
                <p className="text-xs text-zinc-500">Labor hours</p>
                <p className="font-medium">{guide.estimated_labor_hours}h</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Materials</p>
                <p className="font-medium">{money(guide.estimated_material_cost)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">Labor</p>
                <p className="font-medium">{money(guide.estimated_labor_cost)}</p>
              </div>
              <div className="col-span-3 border-t border-zinc-100 pt-1">
                <p className="text-xs text-zinc-500">Total estimate</p>
                <p className="text-base font-semibold text-zinc-900">
                  {money(guide.total_estimated_cost)}
                </p>
              </div>
            </div>
          </div>

          {guide.required_tools.length ? (
            <div>
              <p className="text-sm font-medium text-zinc-800">Required tools</p>
              <ul className="space-y-1">
                {guide.required_tools.map((t, i) => (
                  <li key={i} className="flex justify-between text-sm text-zinc-600">
                    <span>
                      {t.name} <span className="text-zinc-400">({t.category})</span>
                    </span>
                    <span>{money(t.approximate_cost)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {guide.safety_ppe.length ? (
            <div>
              <p className="text-sm font-medium text-zinc-800">Safety / PPE</p>
              <div className="flex flex-wrap gap-1.5">
                {guide.safety_ppe.map((s, i) => (
                  <span key={i} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {guide.critical_pitfalls.length ? (
            <div>
              <p className="text-sm font-medium text-zinc-800">Critical pitfalls</p>
              <ul className="list-disc pl-5 text-sm text-zinc-600">
                {guide.critical_pitfalls.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div>
            <p className="text-sm font-medium text-zinc-800">Execution plan</p>
            <div className="mt-1 space-y-2">
              {guide.execution_phases.map((phase) => (
                <div key={phase.phase_number} className="rounded-lg border border-zinc-200 p-3">
                  <p className="text-sm font-semibold text-zinc-800">
                    Phase {phase.phase_number}: {phase.phase_name}
                  </p>
                  <p className="text-xs text-zinc-500">{phase.description}</p>
                  <ol className="mt-2 space-y-1">
                    {phase.steps.map((step) => (
                      <li key={step.step_number} className="text-sm text-zinc-600">
                        {step.step_number}. {step.title}
                        {step.inspection_gate ? (
                          <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                            inspection gate
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={applyToRehab}
            className="flex w-full items-center justify-center gap-1 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            <ClipboardList className="h-4 w-4" /> Apply to Rehab Budget (as estimate)
          </button>
        </div>
      ) : null}
    </div>
  );
}
