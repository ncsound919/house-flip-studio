// Deterministic RFQ draft builder — shared by /api/contractors/generate-rfq and
// the autonomous agent runner. No LLM here; this is the ground-truth template.
// All numbers come from rehab estimates, never invented.

export interface RfqScopeLine {
  trade?: string | null;
  description: string;
  estimatedCost: number;
}

export interface RfqDraftInput {
  contractorName: string;
  contractorTrade: string;
  address: string;
  scopeLines: RfqScopeLine[];
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function buildBudgetBand(total: number): string {
  if (!total || total <= 0) return "TBD — awaiting estimates";
  // Deterministic band: base total to +15% contingency ceiling.
  const ceiling = Math.round(total * 1.15);
  if (ceiling === total) return formatCurrency(total);
  return `${formatCurrency(total)}\u2013${formatCurrency(ceiling)}`;
}

export function buildDeterministicRfq(input: RfqDraftInput): string {
  const { contractorName, contractorTrade, address, scopeLines } = input;
  const total = scopeLines.reduce((sum, s) => sum + (Number(s.estimatedCost) || 0), 0);
  const budgetBand = buildBudgetBand(total);
  const scopeSection =
    scopeLines.length > 0
      ? scopeLines
          .map((l) => {
            const est = Number(l.estimatedCost) || 0;
            const costLabel = est > 0 ? ` — ${formatCurrency(est)} est.` : "";
            const tradePrefix = l.trade ? `${l.trade}: ` : "";
            return `- ${tradePrefix}${l.description}${costLabel}`;
          })
          .join("\n")
      : "- Scope TBD — confirm with owner before pricing";
  return [
    `Subject: Request for Quote — ${address}`,
    ``,
    `Hi ${contractorName} (${contractorTrade}),`,
    ``,
    `We'd like a quote for work at:`,
    `**${address}**`,
    ``,
    `### Scope of Work`,
    scopeSection,
    ``,
    `### Budget Guidance`,
    `Budget band (deterministic, from rehab estimates): **${budgetBand}**`,
    `Please quote labor + materials separately where possible. Do not exceed the band without a written change order.`,
    ``,
    `### Permits & Compliance`,
    `Permit note: Confirm permit requirements with the local jurisdiction (city/county) before work begins. Include permit costs in your quote if applicable. NC General Contracting thresholds apply (N.C.G.S. § 87-1).`,
    ``,
    `### Schedule & Next Steps`,
    `Please reply with: (1) line-item quote, (2) earliest start date, (3) estimated duration, and (4) any exclusions/assumptions.`,
    ``,
    `Nothing in this draft constitutes a binding commitment — owner will review and issue a formal agreement if we proceed.`,
    ``,
    `Thank you,`,
    `NC House Flip Studio`,
  ].join("\n");
}