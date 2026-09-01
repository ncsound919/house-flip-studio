"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AcquisitionFunnel } from "@/lib/outreach/funnel";
import type { DueOutreachItem } from "@/lib/outreach/engine";
import type { Deal } from "@/lib/types";

const money = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

const KIND_LABELS: Record<string, string> = {
  initial_offer: "Initial offer",
  follow_up: "Follow-up",
  counter: "Counter",
  inquiry: "Inquiry",
  note: "Note",
};

const RESPONSE_LABELS: Record<string, string> = {
  none: "—",
  no_interest: "Not interested",
  counter: "Countered",
  accepted: "Accepted",
  undeliverable: "Undeliverable",
};

interface OutreachRow {
  id: string;
  deal_id: string;
  kind: string;
  channel: string;
  direction: string;
  subject: string | null;
  body: string | null;
  offer_amount: number | null;
  status: string;
  response: string;
  response_note: string | null;
  sent_at: string | null;
  responded_at: string | null;
  created_at: string;
}

interface ComposeState {
  dealId: string;
  kind: string;
  channel: string;
  subject: string;
  body: string;
  emailTo: string;
  offerAmount: string;
}

function emptyCompose(): ComposeState {
  return { dealId: "", kind: "initial_offer", channel: "email", subject: "", body: "", emailTo: "", offerAmount: "" };
}

export default function OutreachDashboard() {
  const [funnel, setFunnel] = useState<AcquisitionFunnel | null>(null);
  const [due, setDue] = useState<DueOutreachItem[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [rows, setRows] = useState<OutreachRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const [sending, setSending] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const res = await fetch("/api/outreach");
      if (!res.ok) throw new Error("Failed to load outreach");
      const data = await res.json();
      setFunnel(data.funnel);
      setDue(data.due);
      setDeals(data.deals);
      setRows(data.outreach);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const rowsByDeal = useMemo(() => {
    const map = new Map<string, OutreachRow[]>();
    for (const r of rows) {
      const list = map.get(r.deal_id) ?? [];
      list.push(r);
      map.set(r.deal_id, list);
    }
    return map;
  }, [rows]);

  const openCompose = (item: { dealId: string; kind: string; channel?: string; subject?: string; body?: string; offerAmount?: string }) => {
    setCompose({
      dealId: item.dealId,
      kind: item.kind,
      channel: item.channel ?? "email",
      subject: item.subject ?? "",
      body: item.body ?? "",
      emailTo: "",
      offerAmount: item.offerAmount ?? "",
    });
  };

  const submitCompose = async () => {
    if (!compose) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deal_id: compose.dealId,
          kind: compose.kind,
          channel: compose.channel,
          subject: compose.subject,
          body: compose.body,
          email_to: compose.emailTo || null,
          offer_amount: compose.offerAmount ? Number(compose.offerAmount) : null,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to send");
      }
      setCompose(null);
      await fetchAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  const respond = async (id: string, response: string) => {
    try {
      await fetch(`/api/outreach/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      await fetchAll();
    } catch {
      // ignore
    }
  };

  if (loading) return <p className="text-sm text-zinc-500">Loading outreach…</p>;

  const funnelCards = funnel
    ? [
        ["Leads", String(funnel.leads)],
        ["Contacted", `${funnel.contacted} (${funnel.conversion.contactedPct}%)`],
        ["Responded", `${funnel.responded} (${funnel.conversion.respondedPct}%)`],
        ["Offered", `${funnel.offered} (${funnel.conversion.offeredPct}%)`],
        ["Contracted", `${funnel.contracted} (${funnel.conversion.contractedPct}%)`],
        ["Closed", `${funnel.closed} (${funnel.conversion.closedPct}%)`],
      ]
    : [];

  return (
    <div>
      {error ? <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      {funnel ? (
        <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-6">
          {funnelCards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-200 bg-white p-4">
              <p className="text-xs font-medium text-zinc-500">{label}</p>
              <p className="mt-1 text-lg font-semibold text-zinc-900">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Due now
          <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-zinc-600">
            {due.length}
          </span>
        </h2>
        {due.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400">
            Nothing due. Enable outreach cadence in Settings, or check back when follow-ups age.
          </p>
        ) : (
          <div className="space-y-2">
            {due.map((item) => (
              <div key={item.deal.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{item.deal.address}</p>
                  <p className="text-xs text-zinc-500">
                    {item.deal.stage} · {item.lastContact ? `last contact ${new Date(item.lastContact.sent_at).toLocaleDateString("en-US")}` : "never contacted"}
                  </p>
                </div>
                <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                  {item.decision.next === "initial_offer" ? "Send first offer" : item.decision.next === "follow_up" ? "Follow up" : "Mark cold"}
                </span>
                <button
                  onClick={() =>
                    openCompose({
                      dealId: item.deal.id,
                      kind: item.decision.next === "initial_offer" ? "initial_offer" : "follow_up",
                      subject: item.draft?.subject,
                      body: item.draft?.body,
                    })
                  }
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Compose
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-zinc-900">All deals</h2>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {deals.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-zinc-400">No deals yet.</p>
        ) : (
          deals.map((d) => {
            const dealRows = rowsByDeal.get(d.id) ?? [];
            const isOpen = expanded === d.id;
            return (
              <div key={d.id} className={d !== deals[0] ? "border-t border-zinc-100" : ""}>
                <button
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{d.address}</p>
                    <p className="text-xs text-zinc-500">
                      {d.stage} · {dealRows.length} contact{dealRows.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="text-xs text-zinc-400">{isOpen ? "Close" : "Open"}</span>
                </button>
                {isOpen ? (
                  <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-4">
                    <div className="mb-4 flex gap-2">
                      <button
                        onClick={() => openCompose({ dealId: d.id, kind: "initial_offer" })}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800"
                      >
                        New offer
                      </button>
                      <button
                        onClick={() => openCompose({ dealId: d.id, kind: "note", channel: "in_person" })}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
                      >
                        Log contact
                      </button>
                    </div>
                    {dealRows.length === 0 ? (
                      <p className="text-sm text-zinc-400">No contact logged for this deal.</p>
                    ) : (
                      <ul className="space-y-2">
                        {dealRows.map((r) => (
                          <li key={r.id} className="rounded-lg border border-zinc-200 bg-white p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium uppercase text-zinc-500">
                                {KIND_LABELS[r.kind] ?? r.kind}
                              </span>
                              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                                {r.channel} · {r.direction}
                              </span>
                              <span className={`text-[10px] font-medium ${r.status === "sent" ? "text-emerald-600" : "text-zinc-400"}`}>
                                {r.status.toUpperCase()}
                              </span>
                              {r.offer_amount != null ? <span className="text-xs text-zinc-600">{money(r.offer_amount)}</span> : null}
                              <span className="ml-auto text-xs text-zinc-400">
                                {r.sent_at ? new Date(r.sent_at).toLocaleDateString("en-US") : new Date(r.created_at).toLocaleDateString("en-US")}
                              </span>
                            </div>
                            {r.subject ? <p className="mt-1 text-sm font-medium text-zinc-900">{r.subject}</p> : null}
                            {r.body ? <p className="mt-0.5 whitespace-pre-line text-xs text-zinc-600">{r.body}</p> : null}
                            {r.response !== "none" ? (
                              <p className="mt-1 text-xs font-medium text-zinc-600">
                                Response: {RESPONSE_LABELS[r.response] ?? r.response}
                                {r.response_note ? ` — ${r.response_note}` : ""}
                              </p>
                            ) : null}
                            {r.direction === "outbound" && r.response === "none" ? (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {(["no_interest", "counter", "accepted", "undeliverable"] as const).map((resp) => (
                                  <button
                                    key={resp}
                                    onClick={() => respond(r.id, resp)}
                                    className="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100"
                                  >
                                    {RESPONSE_LABELS[resp]}
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {compose ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5">
            <h3 className="text-sm font-semibold text-zinc-900">Compose outreach</h3>
            <p className="text-xs text-zinc-500">
              Email sends when a recipient + RESEND key are set; otherwise it's saved as a draft to send manually.
            </p>
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">Kind</span>
                  <select
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                    value={compose.kind}
                    onChange={(e) => setCompose({ ...compose, kind: e.target.value })}
                  >
                    {["initial_offer", "follow_up", "counter", "inquiry", "note"].map((k) => (
                      <option key={k} value={k}>
                        {KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">Channel</span>
                  <select
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                    value={compose.channel}
                    onChange={(e) => setCompose({ ...compose, channel: e.target.value })}
                  >
                    {["email", "mail", "phone", "in_person"].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Recipient email (for email sends)</span>
                <input
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                  value={compose.emailTo}
                  onChange={(e) => setCompose({ ...compose, emailTo: e.target.value })}
                  placeholder="owner@example.com"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Subject</span>
                <input
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                  value={compose.subject}
                  onChange={(e) => setCompose({ ...compose, subject: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Message</span>
                <textarea
                  rows={6}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                  value={compose.body}
                  onChange={(e) => setCompose({ ...compose, body: e.target.value })}
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-zinc-600">Offer amount ($)</span>
                <input
                  type="number"
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
                  value={compose.offerAmount}
                  onChange={(e) => setCompose({ ...compose, offerAmount: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setCompose(null)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                onClick={submitCompose}
                disabled={sending}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send / Save draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
