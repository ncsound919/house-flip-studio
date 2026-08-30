"use client";

import { useRef, useState } from "react";
import { Upload, AlertTriangle } from "lucide-react";

const SCAN_TYPES = [
  { id: "kitchen", label: "Kitchen" },
  { id: "bath", label: "Bathroom" },
  { id: "exterior", label: "Exterior" },
  { id: "roof", label: "Roof" },
  { id: "electrical", label: "Electrical" },
  { id: "plumbing", label: "Plumbing" },
];

interface Issue {
  label: string;
  description: string;
  severity: "low" | "medium" | "high";
  cost_range_min: number;
  cost_range_max: number;
  recommended_trade: string;
}

interface Analysis {
  issues: Issue[];
  summary: string;
  confidence: "high" | "medium" | "low";
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

export default function PhotoUploader({ dealId }: { dealId: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [scanType, setScanType] = useState("kitchen");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  };

  const submit = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch("/api/ai/photo-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, scan_type: scanType, deal_id: dealId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Analysis failed");
      setAnalysis(data.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-semibold text-zinc-900">Photo Analysis</h2>
      <p className="mb-4 text-sm text-zinc-500">
        Upload a photo of a defect area for an AI defect scan.
      </p>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {!image ? (
        <div
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-300 py-12 text-center hover:border-blue-400"
        >
          <Upload className="mb-2 h-8 w-8 text-zinc-400" />
          <p className="text-sm text-zinc-500">Click to upload a photo</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>
      ) : (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="Property"
            className="mb-3 h-48 w-full rounded-xl object-cover"
          />
          <button
            onClick={() => {
              setImage(null);
              setAnalysis(null);
            }}
            className="mb-3 text-xs font-medium text-zinc-500 hover:text-zinc-700"
          >
            Remove photo
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {SCAN_TYPES.map((t) => (
          <button
            key={t.id}
            onClick={() => setScanType(t.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              scanType === t.id
                ? "bg-blue-600 text-white"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        onClick={submit}
        disabled={!image || loading}
        className="mt-4 w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Analyzing…" : "Analyze photo"}
      </button>

      {analysis ? (
        <div className="mt-4 space-y-3">
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              This is an AI estimate, not a contractor quote. Verify before making financial
              decisions.
            </p>
          </div>

          <p className="text-sm text-zinc-700">
            <span className="font-semibold">Summary:</span> {analysis.summary}
          </p>
          <p className="text-xs text-zinc-500">Confidence: {analysis.confidence}</p>

          <div className="space-y-2">
            {analysis.issues.map((issue, i) => (
              <div key={i} className="rounded-lg border border-zinc-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-800">{issue.label}</p>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                      issue.severity === "high"
                        ? "bg-red-50 text-red-700"
                        : issue.severity === "medium"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-green-50 text-green-700"
                    }`}
                  >
                    {issue.severity}
                  </span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{issue.description}</p>
                <p className="mt-1 text-xs text-zinc-700">
                  Estimated: {money(issue.cost_range_min)} – {money(issue.cost_range_max)} ·
                  Trade: {issue.recommended_trade}
                </p>
              </div>
            ))}
            {analysis.issues.length === 0 ? (
              <p className="text-sm text-zinc-400">No issues detected in this photo.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
