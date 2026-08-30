"use client";

import { useState } from "react";

export interface RfqPreviewProps {
  draft_text: string;
  draft_pdf_url?: string;
  onClose: () => void;
  /** Optional: contractor email for mailto link; if omitted, mailto button is hidden */
  contractorEmail?: string | null;
  contractorName?: string;
  contractorTrade?: string;
}

export default function RfqPreview({
  draft_text,
  draft_pdf_url,
  onClose,
  contractorEmail,
  contractorName,
  contractorTrade,
}: RfqPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function handleCopy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(draft_text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts / older browsers
      try {
        const ta = document.createElement("textarea");
        ta.value = draft_text;
        ta.setAttribute("readonly", "");
        ta.style.position = "absolute";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        setCopyError("Copy failed — select and copy manually");
      }
    }
  }

  const mailtoHref =
    contractorEmail?.trim()
      ? `mailto:${encodeURIComponent(contractorEmail.trim())}?subject=${encodeURIComponent(
          `RFQ — ${contractorTrade ?? "Rehab scope"}`,
        )}&body=${encodeURIComponent(draft_text)}`
      : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              RFQ Draft{contractorName ? ` — ${contractorName}` : ""}
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Draft only — review and edit before sending. Nothing auto-sends.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm whitespace-pre-wrap break-words overflow-y-auto flex-1 min-h-[160px]">
          {draft_text}
        </div>

        {copyError && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
            {copyError}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={handleCopy}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
          {mailtoHref && (
            <a
              href={mailtoHref}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Open in email
            </a>
          )}
          {draft_pdf_url && (
            <a
              href={draft_pdf_url}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Download PDF
            </a>
          )}
          <button
            onClick={onClose}
            className="ml-auto rounded-md border border-zinc-300 bg-white px-4 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
