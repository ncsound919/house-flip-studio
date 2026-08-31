import { generate } from "@/lib/llm";
import type { OrgSettings } from "@/lib/orgSettings";

// Rehab scope generator — DETERMINISTIC costs, optional LLM prose.
//
// HONESTY: dollar amounts are always derived from sqft × the operator's
// rehabPerSqft, split across trades by documented percentages. The LLM is only
// allowed to rephrase descriptions; it never invents numbers. When the LLM is
// unavailable or fails validation, the deterministic scope stands.

export interface ScopeLineItem {
  trade: string;
  description: string;
  estimated_cost: number;
}

export interface ScopeResult {
  lines: ScopeLineItem[];
  source: "deterministic" | "llm";
  notes: string[];
}

export function deterministicScope(
  deal: { sqft?: number | null; year_built?: number | null },
  rehabPerSqft: number
): ScopeLineItem[] {
  const sqft = Number(deal.sqft) || 1200;
  const total = Math.max(0, sqft * Math.max(0, rehabPerSqft));
  const year = Number(deal.year_built);
  const older = Number.isFinite(year) && year > 0 && year < 1980;

  const allocations: { trade: string; pct: number; desc: string }[] = [
    { trade: "Interior", pct: 0.35, desc: "Interior paint, flooring, and cosmetic finish" },
    { trade: "Kitchen", pct: 0.2, desc: "Kitchen refresh — cabinets, counters, fixtures" },
    { trade: "Bathroom", pct: 0.15, desc: "Bathroom refresh — fixtures, tile, finish" },
    {
      trade: "Roofing",
      pct: older ? 0.12 : 0.05,
      desc: older ? "Roof assessment/replacement (older structure)" : "Roof inspection and minor repairs",
    },
    {
      trade: "Mechanical",
      pct: older ? 0.1 : 0.05,
      desc: older ? "HVAC/mechanical assessment and repairs (older structure)" : "HVAC tune-up",
    },
    { trade: "Electrical", pct: 0.05, desc: "Electrical panel and outlet updates as needed" },
    { trade: "Plumbing", pct: 0.05, desc: "Plumbing fixtures and visible line repairs" },
    { trade: "General", pct: 0.08, desc: "General contractor, permits, cleanup, and contingency" },
  ];

  const pctSum = allocations.reduce((s, a) => s + a.pct, 0) || 1;
  return allocations.map((a) => ({
    trade: a.trade,
    description: a.desc,
    estimated_cost: Math.round((total * a.pct) / pctSum / 10) * 10,
  }));
}

// Optional LLM pass: rephrase descriptions only. Returns null on any failure so
// the caller keeps the deterministic scope.
async function llmDescriptions(
  deal: { address?: string; sqft?: number | null; year_built?: number | null; city?: string | null },
  lines: ScopeLineItem[]
): Promise<string[] | null> {
  const system =
    "You are a residential rehab scope writer for NC house flips. " +
    "Rewrite each scope line as a concise professional description. " +
    "Do NOT invent trades, change the trade names, or add cost figures. " +
    "Return a JSON array of strings, same order and same length as the input.";

  const prompt = [
    `Property: ${deal.address ?? "unknown"}`,
    deal.city ? `City: ${deal.city}` : "",
    deal.sqft ? `Sqft: ${deal.sqft}` : "",
    deal.year_built ? `Year built: ${deal.year_built}` : "",
    "",
    "Lines (trade | description):",
    ...lines.map((l) => `- ${l.trade} | ${l.description}`),
    "",
    "Return a JSON array of polished descriptions, one per line, same order.",
  ].filter(Boolean).join("\n");

  try {
    const raw = await generate({ prompt, system });
    const trimmed = raw.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return null;
    const descs = parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (descs.length !== lines.length) return null;
    return descs.map((d) => d.trim().slice(0, 200));
  } catch {
    return null;
  }
}

export async function generateScopeForDeal(
  deal: {
    address?: string;
    city?: string | null;
    sqft?: number | null;
    year_built?: number | null;
  },
  settings: OrgSettings
): Promise<ScopeResult> {
  const lines = deterministicScope(deal, settings.underwriting.rehabPerSqft);
  const notes = [
    `Estimated from ${Number(deal.sqft) || 1200} sqft × $${settings.underwriting.rehabPerSqft}/sqft.`,
    "Costs are deterministic estimates — confirm with contractors before committing.",
  ];

  if (settings.llm.generateScopes) {
    const polished = await llmDescriptions(deal, lines);
    if (polished) {
      return {
        lines: lines.map((l, i) => ({ ...l, description: polished[i] })),
        source: "llm",
        notes: [...notes, "Descriptions polished by LLM; costs remain deterministic."],
      };
    }
  }

  return { lines, source: "deterministic", notes };
}