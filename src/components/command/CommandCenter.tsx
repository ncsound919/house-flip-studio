"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Search, AlertTriangle, Zap, ArrowRight, RefreshCw, Home } from "lucide-react";

interface DashboardData {
  counts: {
    totalDeals: number;
    openDeals: number;
    newLeads: number;
    flags: number;
    actions: number;
    overdueDocs: number;
  };
  flags: string[];
  actions: {
    id: string;
    kind: string;
    title: string;
    detail: string;
    dealId?: string;
    contractorId?: string;
  }[];
  topLeads: {
    id: string;
    address: string;
    stage: string;
    asking_price: number | null;
    sqft: number | null;
    attentionScore: number | null;
  }[];
  stages: { stage: string; count: number }[];
}

const money = (n: number | null | undefined) =>
  n != null
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";

const kindColor: Record<string, string> = {
  deal: "bg-blue-50 text-blue-700",
  document: "bg-amber-50 text-amber-700",
  contractor: "bg-purple-50 text-purple-700",
};

const kindLabel: Record<string, string> = {
  deal: "Deal",
  document: "Paperwork",
  contractor: "Contractor",
};

export default function CommandCenter() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hunting, setHunting] = useState(false);
  const [huntResult, setHuntResult] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to load dashboard");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const huntNow = async () => {
    setHunting(true);
    setHuntResult(null);
    try {
      const res = await fetch("/api/leads/hunt", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Hunt failed");
      setHuntResult(
        `Found ${body.newLeads} new lead${body.newLeads === 1 ? "" : "s"} (${body.duplicates} already known).`
      );
      fetchDashboard();
    } catch (e) {
      setHuntResult(e instanceof Error ? e.message : "Hunt failed");
    } finally {
      setHunting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Scanning your pipeline…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Hero: what the app wants you to do today */}
      <div className="rounded-2xl border border-zinc-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Here&apos;s what&apos;s happening</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {data?.counts.actions
                ? `${data.counts.actions} thing${data.counts.actions === 1 ? "" : "s"} need your attention today.`
                : "Nothing needs attention right now. Go find your next flip."}
            </p>
          </div>
          <button
            onClick={huntNow}
            disabled={hunting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {hunting ? "Hunting for leads…" : "Hunt for new leads"}
          </button>
        </div>
        {huntResult ? (
          <p className="mt-3 text-sm font-medium text-zinc-700">{huntResult}</p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/board" className="rounded-xl border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-sm">
          <p className="text-xs text-zinc-500">Open deals</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{data?.counts.openDeals}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-blue-600">
            Open pipeline <ArrowRight className="h-3 w-3" />
          </p>
        </Link>
        <Link href="/leads" className="rounded-xl border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-sm">
          <p className="text-xs text-zinc-500">Leads in pipeline</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{data?.counts.newLeads}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-blue-600">
            Find more <ArrowRight className="h-3 w-3" />
          </p>
        </Link>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Open documents</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{data?.counts.overdueDocs}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="h-3 w-3" /> Needs chasing
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <p className="text-xs text-zinc-500">Red flags</p>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{data?.counts.flags}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
            <AlertTriangle className="h-3 w-3" /> Review below
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Do-this-today queue */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
            <Zap className="h-4 w-4 text-blue-600" /> Do this today
          </h2>
          {data && data.actions.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">Nothing needs action right now.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data?.actions.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-lg border border-zinc-100 p-3">
                  <span className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${kindColor[a.kind] ?? "bg-zinc-100 text-zinc-600"}`}>
                    {kindLabel[a.kind] ?? a.kind}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-800">{a.title}</p>
                    <p className="text-xs text-zinc-500">{a.detail}</p>
                    {a.dealId ? (
                      <Link href={`/deals/${a.dealId}`} className="mt-1 inline-block text-xs font-medium text-blue-600 hover:text-blue-700">
                        Open deal →
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Red flags */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
            <AlertTriangle className="h-4 w-4 text-red-600" /> Red flags
          </h2>
          {data && data.flags.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-400">No red flags detected.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data?.flags.map((f, i) => (
                <li key={i} className="rounded-lg bg-red-50/60 p-3 text-sm text-red-800">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Top auto-scored leads */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-zinc-900">Top scored leads</h2>
          <Link href="/leads" className="text-sm font-medium text-blue-600 hover:text-blue-700">
            Lead finder →
          </Link>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Deterministic feasibility signal from known fields. No ARV = signal only, not a verdict.
        </p>
        {data && data.topLeads.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-400">Add deals or run a hunt to see scored leads here.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {data?.topLeads.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link href={`/deals/${l.id}`} className="truncate text-sm font-medium text-zinc-800 hover:text-blue-600">
                    {l.address}
                  </Link>
                  <p className="text-xs text-zinc-500">
                    {money(l.asking_price)} · {l.sqft ? `${l.sqft.toLocaleString()} sqft` : "sqft unknown"} · {l.stage}
                  </p>
                </div>
                {l.attentionScore != null ? (
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      l.attentionScore >= 70
                        ? "bg-green-50 text-green-700"
                        : l.attentionScore >= 45
                        ? "bg-amber-50 text-amber-700"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {l.attentionScore}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-500">
                    No score
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pipeline mini-view */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900">
            <Home className="h-4 w-4 text-zinc-500" /> Pipeline
          </h2>
          <Link href="/board" className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700">
            <RefreshCw className="h-3 w-3" /> Open full board
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data?.stages.map((s) => (
            <div key={s.stage} className="rounded-lg bg-zinc-50 p-2 text-center">
              <p className="text-lg font-semibold text-zinc-800">{s.count}</p>
              <p className="text-[11px] text-zinc-500">{s.stage}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
