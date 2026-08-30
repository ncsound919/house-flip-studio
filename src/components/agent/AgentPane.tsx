"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Zap, CheckCircle2, AlertTriangle, Clock } from "lucide-react";

interface AgentActionsResponse {
  actions: {
    id: string;
    action_type: string;
    status: string;
    title: string;
    detail: string | null;
    requires_approval: boolean;
    deal_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }[];
  runs: {
    id: string;
    trigger: string;
    status: string;
    summary: Record<string, unknown> | null;
    started_at: string;
    finished_at: string | null;
  }[];
}

const money = (n: number | null | undefined) =>
  n != null
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";

function timeAgo(iso: string): string {
  const d = new Date(iso);
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AgentPane() {
  const [data, setData] = useState<AgentActionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/runs", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load agent activity");
      setData(await res.json());
    } catch {
      // Silent: the pane is non-critical, the rest of Command Center works.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const runNow = async () => {
    setRunning(true);
    setRunMsg(null);
    try {
      const res = await fetch("/api/agent/run", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Run failed");
      setRunMsg(
        `Did ${body.actions} thing${body.actions === 1 ? "" : "s"} (${body.moneyGatesAwaiting} awaiting your approval).`
      );
      await fetchData();
    } catch (e) {
      setRunMsg(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  };

  const approve = async (id: string) => {
    setApproving(id);
    try {
      const res = await fetch(`/api/agent/actions/${id}/approve`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Approve failed");
      await fetchData();
    } catch (e) {
      setRunMsg(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setApproving(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm text-zinc-500">Loading agent activity…</p>
      </div>
    );
  }

  const pendingApprovals = (data?.actions ?? []).filter(
    (a) => a.requires_approval && a.status === "pending_approval"
  );
  const recentActions = (data?.actions ?? []).filter(
    (a) => !pendingApprovals.includes(a)
  ).slice(0, 8);
  const lastRun = data?.runs?.[0];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-lg bg-violet-50 p-1.5 text-violet-600">
            <Bot className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold text-zinc-900">Flip operator</h2>
          {pendingApprovals.length > 0 ? (
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
              {pendingApprovals.length} awaiting you
            </span>
          ) : null}
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-60"
        >
          <Zap className="h-3.5 w-3.5" />
          {running ? "Running…" : "Run now"}
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        {lastRun
          ? `Last run ${timeAgo(lastRun.started_at)} — ${lastRun.status}.`
          : "Never run. Click Run now to let the agent hunt, score, draft, and chase on your behalf."}
      </p>
      {runMsg ? (
        <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-800">
          {runMsg}
        </p>
      ) : null}

      {pendingApprovals.length > 0 ? (
        <div className="mt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" />
            Awaiting your approval
          </h3>
          <ul className="mt-2 space-y-2">
            {pendingApprovals.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-800">{a.title}</p>
                  {a.detail ? (
                    <p className="mt-0.5 text-xs text-zinc-600">{a.detail}</p>
                  ) : null}
                  <p className="mt-0.5 text-[10px] font-mono uppercase tracking-wider text-amber-700">
                    {a.action_type} · {timeAgo(a.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => approve(a.id)}
                  disabled={approving === a.id}
                  className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
                >
                  {approving === a.id ? "…" : "Approve"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {recentActions.length > 0 ? (
        <div className="mt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <Clock className="h-3.5 w-3.5" />
            Recent
          </h3>
          <ul className="mt-2 space-y-1.5">
            {recentActions.map((a) => (
              <li
                key={a.id}
                className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50/50 px-3 py-2"
              >
                {a.status === "done" || a.status === "approved" ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : a.status === "failed" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
                ) : (
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-zinc-700">{a.title}</p>
                  {a.deal_id ? (
                    <Link
                      href={`/deals/${a.deal_id}`}
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      open deal →
                    </Link>
                  ) : null}
                </div>
                <span className="shrink-0 text-[10px] text-zinc-400">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
