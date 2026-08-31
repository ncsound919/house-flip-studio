"use client";

import { useEffect, useState } from "react";

interface SettingsData {
  flipProfile: {
    minAssessed: number;
    maxAssessed: number;
    statewide: boolean;
    counties: string[];
    maxHuntPerRun: number;
  };
  underwriting: {
    rehabPerSqft: number;
    holdingMonths: number;
    downPaymentPct: number;
    interestRate: number;
    loanPoints: number;
  };
  agent: {
    enabled: boolean;
    huntOnCycle: boolean;
    maxHuntPerCycle: number;
    limits: {
      autoSendOffers: { enabled: boolean; maxOfferAmount: number; dailyCap: number };
      autoSendRfq: { enabled: boolean; dailyCap: number };
      autoSpendRehab: { enabled: boolean; monthlyCap: number };
      autoChase: { enabled: boolean; dailyCap: number };
      autoScheduleInspections: { enabled: boolean; maxPerDay: number };
    };
  };
  llm: {
    generateScopes: boolean;
  };
}

const DEFAULT_LIMITS: SettingsData["agent"]["limits"] = {
  autoSendOffers: { enabled: false, maxOfferAmount: 0, dailyCap: 0 },
  autoSendRfq: { enabled: false, dailyCap: 0 },
  autoSpendRehab: { enabled: false, monthlyCap: 0 },
  autoChase: { enabled: false, dailyCap: 0 },
  autoScheduleInspections: { enabled: false, maxPerDay: 0 },
};

const field =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";

export default function FlipProfileForm() {
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => body?.settings && setSettings(body.settings))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="text-sm text-zinc-500">Loading flip profile…</p>;
  }

  const patch = (partial: Partial<SettingsData>) => {
    setSettings((s) => (s ? { ...s, ...partial } : s));
  };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to save");
      setSettings(body.settings ?? settings);
      setMsg("Saved");
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <p className="text-sm text-red-600">Failed to load settings.</p>;
  }

  const setNum = (path: string[], v: string) => {
    const n = v === "" ? 0 : Number(v);
    const set = (obj: Record<string, unknown>, keys: string[]): void => {
      const [k, ...rest] = keys;
      if (rest.length === 0) {
        obj[k] = n;
        return;
      }
      set(obj[k] as Record<string, unknown>, rest);
    };
    const next = structuredClone(settings) as unknown as Record<string, unknown>;
    set(next, path);
    setSettings(next as unknown as SettingsData);
  };

  const setBool = (path: string[], v: boolean) => {
    const next = structuredClone(settings) as unknown as Record<string, unknown>;
    const set = (obj: Record<string, unknown>, keys: string[]): void => {
      const [k, ...rest] = keys;
      if (rest.length === 0) {
        obj[k] = v;
        return;
      }
      set(obj[k] as Record<string, unknown>, rest);
    };
    set(next, path);
    setSettings(next as unknown as SettingsData);
  };

  // Old settings rows predate agent.limits; the schema backfills defaults on
  // load, but a stale client snapshot shouldn't crash the form either.
  const limits = settings.agent.limits ?? DEFAULT_LIMITS;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Flip profile</h3>
        <p className="text-xs text-zinc-500">
          Budget band and hunt scope the autonomous agent uses to find leads.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Min assessed value</span>
            <input
              type="number"
              className={field}
              value={settings.flipProfile.minAssessed}
              onChange={(e) => setNum(["flipProfile", "minAssessed"], e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Max assessed value</span>
            <input
              type="number"
              className={field}
              value={settings.flipProfile.maxAssessed}
              onChange={(e) => setNum(["flipProfile", "maxAssessed"], e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={settings.flipProfile.statewide}
              onChange={(e) =>
                patch({ flipProfile: { ...settings.flipProfile, statewide: e.target.checked } })
              }
            />
            Hunt statewide (all NC counties)
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Counties (comma separated)</span>
            <input
              className={field}
              placeholder="Ignored when hunting statewide"
              disabled={settings.flipProfile.statewide}
              value={settings.flipProfile.counties.join(", ")}
              onChange={(e) =>
                patch({
                  flipProfile: {
                    ...settings.flipProfile,
                    counties: e.target.value
                      .split(",")
                      .map((c) => c.trim())
                      .filter(Boolean),
                  },
                })
              }
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Max properties per hunt</span>
            <input
              type="number"
              className={field}
              value={settings.flipProfile.maxHuntPerRun}
              onChange={(e) => setNum(["flipProfile", "maxHuntPerRun"], e.target.value)}
            />
          </label>
        </div>
        {settings.flipProfile.statewide && settings.flipProfile.counties.length > 0 ? (
          <p className="mt-2 text-xs text-amber-600">
            Statewide is on — the county list is saved but ignored until you turn statewide off.
          </p>
        ) : null}
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Underwriting assumptions</h3>
        <p className="text-xs text-zinc-500">
          Used by the agent when it runs the 70% rule for a new lead.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Rehab $/sqft</span>
            <input
              type="number"
              className={field}
              value={settings.underwriting.rehabPerSqft}
              onChange={(e) => setNum(["underwriting", "rehabPerSqft"], e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Holding months</span>
            <input
              type="number"
              className={field}
              value={settings.underwriting.holdingMonths}
              onChange={(e) => setNum(["underwriting", "holdingMonths"], e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Down payment %</span>
            <input
              type="number"
              className={field}
              value={settings.underwriting.downPaymentPct}
              onChange={(e) => setNum(["underwriting", "downPaymentPct"], e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Interest rate %</span>
            <input
              type="number"
              className={field}
              value={settings.underwriting.interestRate}
              onChange={(e) => setNum(["underwriting", "interestRate"], e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-zinc-600">Loan points</span>
            <input
              type="number"
              className={field}
              value={settings.underwriting.loanPoints}
              onChange={(e) => setNum(["underwriting", "loanPoints"], e.target.value)}
            />
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Autonomous agent</h3>
        <p className="text-xs text-zinc-500">
          What the scheduled agent cycle is allowed to do on your behalf.
        </p>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={settings.agent.enabled}
              onChange={(e) => setBool(["agent", "enabled"], e.target.checked)}
            />
            Agent cycle enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={settings.agent.huntOnCycle}
              onChange={(e) => setBool(["agent", "huntOnCycle"], e.target.checked)}
            />
            Hunt leads on every cycle
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={settings.llm.generateScopes}
              onChange={(e) => setBool(["llm", "generateScopes"], e.target.checked)}
            />
            Generate rehab scope drafts (LLM, reviewable)
          </label>
          <label className="block max-w-xs">
            <span className="text-xs font-medium text-zinc-600">Max leads per cycle</span>
            <input
              type="number"
              className={field}
              value={settings.agent.maxHuntPerCycle}
              onChange={(e) => setNum(["agent", "maxHuntPerCycle"], e.target.value)}
            />
          </label>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Autonomy guardrails</h3>
        <p className="text-xs text-zinc-500">
          Guardrails default to OFF. The agent auto-approves money actions ONLY within these
          limits and escalates everything else. Every auto-approval is logged with the rule and
          evidence.
        </p>
        <div className="mt-3 space-y-3">
          <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={limits.autoSendOffers.enabled}
                onChange={(e) => setBool(["agent", "limits", "autoSendOffers", "enabled"], e.target.checked)}
              />
              Auto-approve offers (advance → Offer Made)
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Max offer amount ($)</span>
                <input
                  type="number"
                  className={field}
                  value={limits.autoSendOffers.maxOfferAmount}
                  onChange={(e) => setNum(["agent", "limits", "autoSendOffers", "maxOfferAmount"], e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Daily cap (offers)</span>
                <input
                  type="number"
                  className={field}
                  value={limits.autoSendOffers.dailyCap}
                  onChange={(e) => setNum(["agent", "limits", "autoSendOffers", "dailyCap"], e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={limits.autoSendRfq.enabled}
                onChange={(e) => setBool(["agent", "limits", "autoSendRfq", "enabled"], e.target.checked)}
              />
              Auto-send RFQs to verified contractors
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Daily cap (RFQs)</span>
                <input
                  type="number"
                  className={field}
                  value={limits.autoSendRfq.dailyCap}
                  onChange={(e) => setNum(["agent", "limits", "autoSendRfq", "dailyCap"], e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={limits.autoSpendRehab.enabled}
                onChange={(e) => setBool(["agent", "limits", "autoSpendRehab", "enabled"], e.target.checked)}
              />
              Auto-approve rehab spend (payment draws)
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Monthly cap ($)</span>
                <input
                  type="number"
                  className={field}
                  value={limits.autoSpendRehab.monthlyCap}
                  onChange={(e) => setNum(["agent", "limits", "autoSpendRehab", "monthlyCap"], e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={limits.autoChase.enabled}
                onChange={(e) => setBool(["agent", "limits", "autoChase", "enabled"], e.target.checked)}
              />
              Auto-chase overdue documents
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Daily cap (chases)</span>
                <input
                  type="number"
                  className={field}
                  value={limits.autoChase.dailyCap}
                  onChange={(e) => setNum(["agent", "limits", "autoChase", "dailyCap"], e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 p-3">
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={limits.autoScheduleInspections.enabled}
                onChange={(e) =>
                  setBool(["agent", "limits", "autoScheduleInspections", "enabled"], e.target.checked)
                }
              />
              Auto-schedule inspections
            </label>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Max per day</span>
                <input
                  type="number"
                  className={field}
                  value={limits.autoScheduleInspections.maxPerDay}
                  onChange={(e) =>
                    setNum(["agent", "limits", "autoScheduleInspections", "maxPerDay"], e.target.value)
                  }
                />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {msg ? (
          <span className={`text-sm ${msg === "Saved" ? "text-green-600" : "text-red-600"}`}>{msg}</span>
        ) : null}
      </div>
    </div>
  );
}