import { NextResponse } from "next/server";
import { requireOrgId, createAdminClient } from "@/lib/apiHelpers";
import { generate } from "@/lib/llm";

export const dynamic = "force-dynamic";

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function buildBudgetBand(total: number): string {
  if (!total || total <= 0) return "TBD — awaiting estimates";
  // Deterministic band: base total to +15% contingency ceiling.
  // Never LLM-invented.
  const ceiling = Math.round(total * 1.15);
  if (ceiling === total) return formatCurrency(total);
  return `${formatCurrency(total)}\u2013${formatCurrency(ceiling)}`;
}

function buildDeterministicDraft(opts: {
  contractorName: string;
  contractorTrade: string;
  address: string;
  scopeLines: string[];
  budgetBand: string;
  total: number;
}): string {
  const { contractorName, contractorTrade, address, scopeLines, budgetBand } = opts;
  const scopeSection =
    scopeLines.length > 0
      ? scopeLines.map((l) => `- ${l}`).join("\n")
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

export async function POST(req: Request) {
  let orgId: string;
  try {
    const ctx = await requireOrgId();
    orgId = ctx.orgId;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unauthorized" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const contractor_id =
    typeof body.contractor_id === "string" ? body.contractor_id.trim() : "";
  const deal_id = typeof body.deal_id === "string" ? body.deal_id.trim() : "";
  const rehab_item_ids = Array.isArray(body.rehab_item_ids)
    ? (body.rehab_item_ids as unknown[]).filter((v) => typeof v === "string") as string[]
    : undefined;

  if (!contractor_id || !deal_id) {
    return NextResponse.json(
      { error: "contractor_id and deal_id required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Fetch contractor — org-checked
  const { data: contractor, error: contractorErr } = await admin
    .from("contractors")
    .select("id, org_id, name, trade, email, phone, license_number, license_tier")
    .eq("id", contractor_id)
    .single();

  if (contractorErr || !contractor) {
    return NextResponse.json({ error: "Contractor not found" }, { status: 404 });
  }
  if (contractor.org_id !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch deal — org-checked
  const { data: deal, error: dealErr } = await admin
    .from("deals")
    .select("id, org_id, address, city, state, zip")
    .eq("id", deal_id)
    .single();

  if (dealErr || !deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }
  if (deal.org_id !== orgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Fetch rehab items for this deal (org-checked). Filter by rehab_item_ids if provided.
  let rehabQuery = admin
    .from("rehab_items")
    .select("id, deal_id, org_id, trade, description, estimated_cost, status")
    .eq("deal_id", deal_id)
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (rehab_item_ids && rehab_item_ids.length > 0) {
    rehabQuery = rehabQuery.in("id", rehab_item_ids);
  }

  const { data: rehabItems, error: rehabErr } = await rehabQuery;

  if (rehabErr) {
    return NextResponse.json({ error: "Failed to load rehab items" }, { status: 500 });
  }

  // Honesty: org-check each rehab item even though query filtered by org_id
  const items = (rehabItems ?? []).filter((r) => r.org_id === orgId && r.deal_id === deal_id);

  const addressParts = [
    deal.address,
    [deal.city, deal.state].filter(Boolean).join(", "),
    deal.zip,
  ].filter(Boolean);
  const addressLine = addressParts.join(" ").replace(/\s+/g, " ").trim() || deal.address;

  const scopeLines = items.map((item) => {
    const est = Number(item.estimated_cost) || 0;
    const costLabel = est > 0 ? ` — ${formatCurrency(est)} est.` : "";
    const tradePrefix = item.trade ? `${item.trade}: ` : "";
    return `${tradePrefix}${item.description}${costLabel}`;
  });

  const total = items.reduce((sum, r) => sum + (Number(r.estimated_cost) || 0), 0);
  const budgetBand = buildBudgetBand(total);

  // Deterministic draft is the ground truth
  const deterministicDraft = buildDeterministicDraft({
    contractorName: contractor.name,
    contractorTrade: contractor.trade ?? "contractor",
    address: addressLine,
    scopeLines,
    budgetBand,
    total,
  });

  // LLM embellishment: body text only. Never overwrites deterministic fields.
  // If LLM unavailable (missing key, network), fall back to deterministic draft.
  let draft_text = deterministicDraft;
  const include = Array.isArray(body.include)
    ? (body.include as string[]).join(", ")
    : "scope, schedule, budget band, permit note";

  try {
    const system =
      "You are drafting a professional Request for Quote email for a house flip. " +
      "Write a concise, polite RFQ body. Do NOT invent addresses, scope line items, budget numbers, or prices — those are provided below and must not be altered. " +
      "You may only rephrase the greeting/closing and add brief professional context. Keep it short.";

    const prompt = [
      `Contractor: ${contractor.name} (${contractor.trade ?? "contractor"})`,
      `Property address (DO NOT CHANGE): ${addressLine}`,
      `Scope line items (DO NOT CHANGE):`,
      ...(scopeLines.length ? scopeLines.map((l) => `- ${l}`) : ["- (no rehab items yet — note scope TBD)"]),
      `Budget band (DO NOT CHANGE, deterministic from rehab totals): ${budgetBand}`,
      `Total estimated_cost sum: ${formatCurrency(total)}`,
      `Permit note (DO NOT CHANGE): Confirm permit requirements with local jurisdiction before work begins.`,
      `Include: ${include}`,
      ``,
      `Deterministic draft (use as authoritative source for fields):`,
      "---",
      deterministicDraft,
      "---",
      `Task: Produce a polished markdown RFQ draft that preserves the address, scope, budget band, and permit note verbatim. Rephrase only the surrounding prose.`,
    ].join("\n");

    const llmRes = await generate({ prompt, system });
    if (llmRes?.text && llmRes.text.trim().length > 80) {
      // Trust but verify: ensure deterministic tokens still present; otherwise keep deterministic draft
      const t = llmRes.text.trim();
      const hasAddress = t.includes(addressLine);
      const hasBudget = t.includes(budgetBand);
      if (hasAddress && hasBudget) {
        draft_text = t;
      }
    }
  } catch {
    // LLM unavailable — deterministic draft is valid fallback
  }

  // Never auto-send. Optional PDF is TBD; draft_text alone satisfies the task.
  return NextResponse.json({ draft_text });
}
