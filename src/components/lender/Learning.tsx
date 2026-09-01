"use client";

import { useCallback, useEffect, useState } from "react";

interface Lesson {
  id: string;
  pattern: string;
  lesson: string;
  evidence_count: number;
  last_seen: string;
}

interface Outcome {
  kind: string;
  summary: string;
  detail: string;
  success: boolean;
  occurred_at: string;
}

interface Insight {
  metric: string;
  value: number;
  sample_size: number;
  window_start: string;
}

interface LearningData {
  lessons: Lesson[];
  outcomes: Outcome[];
  insights: Insight[];
}

const METRIC_LABELS: Record<string, string> = {
  arv_accuracy_pct: "ARV accuracy %",
  profit_accuracy_pct: "Profit accuracy %",
  rehab_variance_pct: "Rehab variance %",
  rehab_per_sqft: "Rehab $/sqft",
  hold_months_avg: "Avg hold (months)",
};

export default function Learning() {
  const [data, setData] = useState<LearningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/learning");
      if (!res.ok) throw new Error("Failed to load learning");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/learning", { method: "POST" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Sync failed");
      }
      const r = await res.json();
      setNotice(`Synced: ${r.recordedOutcomes} outcomes, ${r.lessons} lessons, ${r.insights} trend points.`);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading learning…</p>;

  const trends = new Map<string, Insight[]>();
  for (const i of data?.insights ?? []) {
    const list = trends.get(i.metric) ?? [];
    list.push(i);
    trends.set(i.metric, list);
  }

  return (
    <div>
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Outcomes from closed deals distill into lessons, and market signals are snapshotted over time — the
          learning loop, built only from real outcomes.
        </p>
        <button
          onClick={sync}
          disabled={syncing}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync learning"}
        </button>
      </div>

      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">
            Lessons
            <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600">
              {data?.lessons.length ?? 0}
            </span>
          </h2>
          {!data?.lessons.length ? (
            <p className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400">
              No lessons yet. Close a deal and run Sync.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.lessons.map((l) => (
                <li key={l.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-900">{l.pattern}</p>
                    <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                      {l.evidence_count} ev
                    </span>
                  </div>
                  <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-zinc-600">{l.lesson}</pre>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Market trends</h2>
          {trends.size === 0 ? (
            <p className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400">
              No trend data yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {[...trends.entries()].map(([metric, points]) => {
                const sorted = [...points].sort((a, b) => a.window_start.localeCompare(b.window_start));
                const latest = sorted[sorted.length - 1];
                return (
                  <li key={metric} className="rounded-xl border border-zinc-200 bg-white p-4">
                    <div className="flex items-baseline justify-between">
                      <p className="text-sm font-medium text-zinc-900">{METRIC_LABELS[metric] ?? metric}</p>
                      <p className="text-sm font-semibold text-zinc-900">{latest.value}</p>
                    </div>
                    {sorted.length > 1 ? (
                      <div className="mt-2 flex items-end gap-1">
                        {sorted.map((p) => (
                          <div
                            key={p.window_start}
                            className="flex-1 rounded-t bg-zinc-200"
                            style={{ height: `${Math.max(6, Math.min(48, (p.value / (Math.max(...sorted.map((x) => x.value)) || 1)) * 48))}px` }}
                          />
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-1 text-[10px] text-zinc-400">
                      {sorted.length} snapshot{sorted.length === 1 ? "" : "s"} · sample {latest.sample_size}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-zinc-900">Recent outcomes</h2>
      {!data?.outcomes.length ? (
        <p className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400">
          No outcomes recorded yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <ul className="divide-y divide-zinc-100">
            {data.outcomes.map((o, i) => (
              <li key={i} className="flex items-start gap-3 px-4 py-2 text-sm">
                <span className={`mt-1 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${o.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {o.success ? "ok" : "issue"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-zinc-900">{o.summary}</p>
                  <p className="truncate text-xs text-zinc-500">{o.detail}</p>
                </div>
                <span className="shrink-0 text-xs text-zinc-400">{new Date(o.occurred_at).toLocaleDateString("en-US")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
