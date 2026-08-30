"use client";

import { useCallback, useEffect, useState } from "react";
import { Send } from "lucide-react";
import type { Deal, DealStage } from "@/lib/types";
import { DEAL_STAGES, type Contractor } from "@/lib/types";
import RehabBudget from "./RehabBudget";
import DocumentTracker from "@/components/documents/DocumentTracker";
import UnderwritingForm from "./UnderwritingForm";
import RepairGuideForm from "@/components/ai/RepairGuideForm";
import PhotoUploader from "@/components/ai/PhotoUploader";
import type { DealComment } from "@/app/api/deals/[id]/comments/route";

type Tab = "overview" | "rehab" | "documents" | "underwriting" | "ai";

const tabs: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "rehab", label: "Rehab" },
  { id: "documents", label: "Documents" },
  { id: "underwriting", label: "Underwriting" },
  { id: "ai", label: "AI Tools" },
];

export default function DealDetail({
  deal,
  contractors,
  initialComments,
}: {
  deal: Deal;
  contractors: Contractor[];
  initialComments: DealComment[];
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [comments, setComments] = useState<DealComment[]>(initialComments);
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [form, setForm] = useState({
    address: deal.address,
    city: deal.city ?? "",
    state: deal.state ?? "NC",
    zip: deal.zip ?? "",
    asking_price: deal.asking_price?.toString() ?? "",
    sqft: deal.sqft?.toString() ?? "",
    beds: deal.beds?.toString() ?? "",
    baths: deal.baths?.toString() ?? "",
    year_built: deal.year_built?.toString() ?? "",
    lot_size: deal.lot_size ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const postComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    setPosting(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: comment }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to post comment");
      }
      setComment("");
      fetchComments();
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setPosting(false);
    }
  };

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/deals/${deal.id}/comments`);
      if (res.ok) {
        const { comments: data } = await res.json();
        setComments(data);
      }
    } catch {
      // ignore refresh errors
    }
  }, [deal.id]);

  const updateStage = async (stage: DealStage) => {
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (res.ok) {
        // The page will re-render on refresh; fire a soft refresh.
        window.location.reload();
      }
    } catch {
      // ignore
    }
  };

  const saveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: form.address,
          city: form.city || null,
          state: form.state || "NC",
          zip: form.zip || null,
          asking_price: form.asking_price ? Number(form.asking_price) : null,
          sqft: form.sqft ? Number(form.sqft) : null,
          beds: form.beds ? Number(form.beds) : null,
          baths: form.baths ? Number(form.baths) : null,
          year_built: form.year_built ? Number(form.year_built) : null,
          lot_size: form.lot_size || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none";
  const labelCls = "flex flex-col gap-1 text-sm font-medium text-zinc-700";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{deal.address}</h1>
          <p className="text-sm text-zinc-500">
            {[deal.city, deal.state, deal.zip].filter(Boolean).join(", ") || "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={deal.stage}
            onChange={(e) => updateStage(e.target.value as DealStage)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          >
            {DEAL_STAGES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-zinc-200">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Property info form */}
          <form onSubmit={saveProperty} className="space-y-3 rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="text-base font-semibold text-zinc-900">Property Info</h2>
            <label className={labelCls}>
              Address *
              <input
                required
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className={inputCls}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={labelCls}>
                City
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputCls} />
              </label>
              <label className={labelCls}>
                ZIP
                <input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} className={inputCls} />
              </label>
              <label className={labelCls}>
                Asking price
                <input
                  type="number"
                  min="0"
                  value={form.asking_price}
                  onChange={(e) => setForm({ ...form, asking_price: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Sqft
                <input
                  type="number"
                  min="0"
                  value={form.sqft}
                  onChange={(e) => setForm({ ...form, sqft: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Beds
                <input
                  type="number"
                  min="0"
                  value={form.beds}
                  onChange={(e) => setForm({ ...form, beds: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Baths
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={form.baths}
                  onChange={(e) => setForm({ ...form, baths: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Year built
                <input
                  type="number"
                  min="1800"
                  max="2026"
                  value={form.year_built}
                  onChange={(e) => setForm({ ...form, year_built: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className={labelCls}>
                Lot size
                <input value={form.lot_size} onChange={(e) => setForm({ ...form, lot_size: e.target.value })} className={inputCls} />
              </label>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              {saveMsg ? (
                <span className={`text-sm ${saveMsg === "Saved" ? "text-green-600" : "text-red-600"}`}>
                  {saveMsg}
                </span>
              ) : null}
            </div>
          </form>

          {/* Comments */}
          <div className="rounded-xl border border-zinc-200 bg-white p-5">
            <h2 className="mb-3 text-base font-semibold text-zinc-900">Notes & Comments</h2>
            <div className="mb-3 max-h-72 space-y-3 overflow-y-auto">
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-zinc-50 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-medium text-zinc-700">
                      {c.profiles?.display_name ?? "Partner"}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {new Date(c.created_at).toLocaleString()}
                    </p>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-zinc-800">{c.content}</p>
                </div>
              ))}
              {comments.length === 0 ? (
                <p className="text-sm text-zinc-400">No comments yet.</p>
              ) : null}
            </div>
            <form onSubmit={postComment} className="flex items-start gap-2">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                placeholder="Add a comment visible to both partners…"
                className="flex-1 resize-none rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={posting || !comment.trim()}
                className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            {commentError ? (
              <p className="mt-2 text-xs text-red-600">{commentError}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "rehab" ? (
        <RehabBudget
          dealId={deal.id}
          orgId={deal.org_id}
          contractors={contractors}
        />
      ) : null}

      {tab === "documents" ? <DocumentTracker dealId={deal.id} /> : null}

      {tab === "underwriting" ? <UnderwritingForm dealId={deal.id} initialArv={deal.asking_price ?? undefined} /> : null}

      {tab === "ai" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <PhotoUploader dealId={deal.id} />
          <RepairGuideForm
            dealId={deal.id}
            defaultProperty={{
              address: deal.address,
              yearBuilt: deal.year_built ?? undefined,
              sqft: deal.sqft ?? undefined,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
