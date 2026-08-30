"use client";

import { FileDown } from "lucide-react";
import { DOC_TYPE_LABELS } from "./DocumentTracker";
import type { DocStatus, DocType, DocumentRow } from "@/app/api/documents/route";

const statusBadge: Record<DocStatus, string> = {
  missing: "bg-zinc-100 text-zinc-600",
  requested: "bg-amber-50 text-amber-700",
  received: "bg-blue-50 text-blue-700",
  filed: "bg-green-50 text-green-700",
};

export default function DocumentChecklistItem({
  doc,
  onStatusChange,
}: {
  doc: DocumentRow;
  onStatusChange: (id: string, status: DocStatus) => void;
}) {
  const canGeneratePdf =
    doc.doc_type === "conditional_lien_waiver" ||
    doc.doc_type === "unconditional_lien_waiver";

  return (
    <tr className="border-b border-zinc-100 last:border-0">
      <td className="px-3 py-2">
        <p className="text-sm font-medium text-zinc-800">{DOC_TYPE_LABELS[doc.doc_type]}</p>
        <p className="text-xs text-zinc-400">{doc.rehab_items?.description ?? "—"}</p>
      </td>
      <td className="px-3 py-2 text-xs text-zinc-500">{doc.requested_at ?? "—"}</td>
      <td className="px-3 py-2 text-xs text-zinc-500">{doc.received_at ?? "—"}</td>
      <td className="px-3 py-2">
        <select
          value={doc.status}
          onChange={(e) => onStatusChange(doc.id, e.target.value as DocStatus)}
          className={`rounded px-2 py-1 text-xs font-medium ${statusBadge[doc.status]}`}
        >
          <option value="missing">Missing</option>
          <option value="requested">Requested</option>
          <option value="received">Received</option>
          <option value="filed">Filed</option>
        </select>
      </td>
      <td className="px-3 py-2 text-right">
        {canGeneratePdf ? (
          <a
            href={`/api/documents/generate-lien-waiver/${doc.id}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-200"
          >
            <FileDown className="h-3 w-3" /> PDF
          </a>
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
      </td>
    </tr>
  );
}
