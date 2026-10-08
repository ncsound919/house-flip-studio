import { z } from "zod";
import { huntLeads } from "@/lib/leadHunt";
import { scoreLead } from "@/lib/leadScoring";
import { scoreAndTier, type LeadTier } from "@/lib/leadTier";
import { compileDossier } from "@/lib/research/dossier";
import { getOrgSettings, DEFAULT_SETTINGS } from "@/lib/orgSettings";
import type { ListingCard } from "@/lib/listingSources/types";
import { createAdminClient } from "@/lib/apiHelpers";

// MCP tool surface for the House Flip Studio. This is the machine-facing
// counterpart to the operator UI: an external orchestrator (deterministic-brain,
// Claude, Cursor, ...) can call these tools over JSON-RPC to run an autonomous
// distressed-property sweep and pull the results back.
//
// HONESTY: none of these tools invent a deal. `hunt_leads` persists real leads
// from the configured county feed, `score_lead` returns a feasibility signal
// (never a verdict — ARV is still unknown), and `build_dossier` records each
// source as ok/error independently.

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: "hunt_leads",
    description:
      "Run a distressed-property hunt and persist new leads. Sweeps the NC OneMap " +
      "county parcel feed using the org's flip profile, dedupes by address + parcel PIN, " +
      "applies the affordability and distress gates, then scores and tiers each lead.",
    inputSchema: {
      type: "object",
      properties: {
        org_id: { type: "string", description: "Organization id to hunt for (required)." },
        statewide: { type: "boolean", description: "Sweep all NC counties vs. only org counties." },
        counties: { type: "array", items: { type: "string" }, description: "County names to hunt." },
        max_total: { type: "number", description: "Cap on records scanned this run." },
        require_distress: {
          type: "boolean",
          description: "Reject leads with zero motivation signals.",
        },
        max_purchase_price: {
          type: "number",
          description: "Estimated market price ceiling (0 = off).",
        },
      },
      required: ["org_id"],
      additionalProperties: false,
    },
  },
  {
    name: "list_leads",
    description:
      "List stored leads for an organization, re-scored and optionally filtered by tier.",
    inputSchema: {
      type: "object",
      properties: {
        org_id: { type: "string", description: "Organization id (required)." },
        tier: { type: "string", enum: ["hot", "warm", "cold"] },
        limit: { type: "number", description: "Max leads to return (default 25, max 200)." },
      },
      required: ["org_id"],
      additionalProperties: false,
    },
  },
  {
    name: "score_lead",
    description:
      "Score a single property without persisting it. Returns a feasibility signal " +
      "(attentionScore 0-100 + tier), never a deal verdict.",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string" },
        county: { type: "string" },
        price: { type: "number" },
        sqft: { type: "number" },
        beds: { type: "number" },
        baths: { type: "number" },
        year_built: { type: "number" },
        assessed_value: { type: "number" },
        owner_mailing_state: { type: "string" },
        motivation: {
          type: "object",
          properties: {
            absenteeOwner: { type: "boolean" },
            outOfStateOwner: { type: "boolean" },
            longHeld: { type: "boolean" },
            olderHome: { type: "boolean" },
            multiParcelOwner: { type: "boolean" },
            taxDelinquent: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
      required: ["address", "county"],
      additionalProperties: false,
    },
  },
  {
    name: "build_dossier",
    description:
      "Compile a research dossier for one property from every configured source " +
      "(county tax, deeds, liens, permits, foreclosure notices, RentCast).",
    inputSchema: {
      type: "object",
      properties: {
        address: { type: "string" },
        deal_id: { type: "string" },
        pin: { type: "string" },
        min_assessed: { type: "number" },
        max_assessed: { type: "number" },
      },
      required: ["address"],
      additionalProperties: false,
    },
  },
];

const motivationSchema = z
  .object({
    absenteeOwner: z.boolean().optional(),
    outOfStateOwner: z.boolean().optional(),
    longHeld: z.boolean().optional(),
    olderHome: z.boolean().optional(),
    multiParcelOwner: z.boolean().optional(),
    taxDelinquent: z.boolean().optional(),
  })
  .strict();

const huntArgs = z
  .object({
    org_id: z.string().min(1),
    statewide: z.boolean().optional(),
    counties: z.array(z.string()).optional(),
    max_total: z.number().positive().optional(),
    require_distress: z.boolean().optional(),
    max_purchase_price: z.number().nonnegative().optional(),
  })
  .strict();

const listArgs = z
  .object({
    org_id: z.string().min(1),
    tier: z.enum(["hot", "warm", "cold"]).optional(),
    limit: z.number().int().positive().max(200).optional(),
  })
  .strict();

const scoreArgs = z
  .object({
    address: z.string().min(1),
    county: z.string(),
    price: z.number().nonnegative().optional(),
    sqft: z.number().nonnegative().optional(),
    beds: z.number().optional(),
    baths: z.number().optional(),
    year_built: z.number().optional(),
    assessed_value: z.number().nonnegative().optional(),
    owner_mailing_state: z.string().optional(),
    motivation: motivationSchema.optional(),
  })
  .strict();

const dossierArgs = z
  .object({
    address: z.string().min(1),
    deal_id: z.string().optional(),
    pin: z.string().optional(),
    min_assessed: z.number().nonnegative().optional(),
    max_assessed: z.number().nonnegative().optional(),
  })
  .strict();

export function listTools(): McpToolDefinition[] {
  return MCP_TOOLS;
}

// Motivation signals for a hand-scored lead. reasonCount/reasons are derived so
// the caller can't inflate them independently of the flags.
function buildMotivation(
  m: z.infer<typeof motivationSchema> | undefined,
  ownerMailingState: string | undefined
): ListingCard["motivation"] {
  const outOfStateOwner =
    m?.outOfStateOwner ?? Boolean(ownerMailingState && ownerMailingState.trim().length > 0);
  const b = {
    absenteeOwner: m?.absenteeOwner ?? false,
    outOfStateOwner,
    longHeld: m?.longHeld ?? false,
    olderHome: m?.olderHome ?? false,
    multiParcelOwner: m?.multiParcelOwner ?? false,
    taxDelinquent: m?.taxDelinquent ?? false,
  };
  const reasons: string[] = [];
  if (b.absenteeOwner) reasons.push("Absentee owner");
  if (b.outOfStateOwner) reasons.push("Out-of-state owner");
  if (b.longHeld) reasons.push("Long-held");
  if (b.olderHome) reasons.push("Older home");
  if (b.multiParcelOwner) reasons.push("Multi-parcel owner");
  if (b.taxDelinquent) reasons.push("Tax delinquent");
  return { ...b, reasonCount: reasons.length, reasons };
}

function scoreLeadTool(args: z.infer<typeof scoreArgs>) {
  const card: ListingCard = {
    address: args.address,
    county: args.county,
    price: args.price,
    sqft: args.sqft,
    beds: args.beds,
    baths: args.baths,
    year_built: args.year_built,
    source: "api",
    source_label: "mcp_score",
    parcel: args.assessed_value != null ? { assessedValue: args.assessed_value } : undefined,
    motivation: buildMotivation(args.motivation, args.owner_mailing_state),
  };
  const { score, tier } = scoreAndTier(card, DEFAULT_SETTINGS.flipProfile);
  return { address: args.address, tier, score };
}

async function huntLeadsTool(args: z.infer<typeof huntArgs>) {
  const settings = await getOrgSettings(args.org_id);
  const flipProfile = {
    ...settings.flipProfile,
    ...(args.require_distress !== undefined ? { requireDistress: args.require_distress } : {}),
    ...(args.max_purchase_price !== undefined ? { maxPurchasePrice: args.max_purchase_price } : {}),
  };
  const merged = { ...settings, flipProfile };
  const result = await huntLeads({
    orgId: args.org_id,
    statewide: args.statewide ?? flipProfile.statewide,
    counties: args.counties ?? flipProfile.counties,
    maxTotal: args.max_total ?? flipProfile.maxHuntPerRun,
    settings: merged,
  });
  return result;
}

async function listLeadsTool(args: z.infer<typeof listArgs>) {
  const admin = createAdminClient();
  const limit = Math.min(args.limit ?? 25, 200);
  const settings = await getOrgSettings(args.org_id);

  const r = await admin
    .from("deals")
    .select("id, address, city, state, stage, asking_price, sqft, beds, baths, year_built, assessed_value, notes")
    .eq("org_id", args.org_id)
    .limit(500);

  if (r.error) {
    // Older DBs may lack assessed_value (migration 005). Fall back to the safe set.
    const fallback = await admin
      .from("deals")
      .select("id, address, city, state, stage, asking_price, sqft, beds, baths, year_built, notes")
      .eq("org_id", args.org_id)
      .limit(500);
    if (fallback.error) throw new Error(fallback.error.message);
    return rankDeals(fallback.data ?? [], settings.flipProfile, args.tier, limit);
  }
  return rankDeals(r.data ?? [], settings.flipProfile, args.tier, limit);
}

interface DealRow {
  id?: string;
  address?: string;
  city?: string | null;
  stage?: string | null;
  asking_price?: number | null;
  sqft?: number | null;
  beds?: number | null;
  baths?: number | null;
  year_built?: number | null;
  assessed_value?: number | null;
  notes?: string | null;
}

function rankDeals(
  rows: DealRow[],
  flipProfile: typeof DEFAULT_SETTINGS.flipProfile,
  tierFilter: LeadTier | undefined,
  limit: number
) {
  const scored = rows
    .filter((d) => Boolean(d.address))
    .map((d) => {
      const card: ListingCard = {
        address: d.address as string,
        city: d.city ?? undefined,
        county: "",
        price: d.asking_price ?? undefined,
        sqft: d.sqft ?? undefined,
        beds: d.beds ?? undefined,
        baths: d.baths ?? undefined,
        year_built: d.year_built ?? undefined,
        source: "county_gis",
        source_label: "mcp_list",
        parcel: d.assessed_value != null ? { assessedValue: d.assessed_value } : undefined,
      };
      const { score, tier } = scoreAndTier(card, flipProfile);
      const storedTier = d.notes?.match(/Tier:\s*(HOT|WARM|COLD)\s*LEAD/i)?.[1]?.toLowerCase();
      return {
        id: d.id,
        address: card.address,
        city: card.city ?? null,
        stage: d.stage ?? null,
        tier,
        storedTier: storedTier ?? null,
        attentionScore: score.attentionScore,
        rating: score.rating,
        flags: score.flags,
        needsArv: score.needsArv,
      };
    })
    .filter((l) => (tierFilter ? l.tier === tierFilter : true))
    .sort((a, b) => b.attentionScore - a.attentionScore);

  return { count: scored.length, leads: scored.slice(0, limit) };
}

async function buildDossierTool(args: z.infer<typeof dossierArgs>) {
  return compileDossier({
    dealId: args.deal_id ?? "",
    address: args.address,
    pin: args.pin,
    profile: {
      minAssessed: args.min_assessed ?? DEFAULT_SETTINGS.flipProfile.minAssessed,
      maxAssessed: args.max_assessed ?? DEFAULT_SETTINGS.flipProfile.maxAssessed,
    },
  });
}

// Dispatch a tool by name. Validation errors and unknown tools return ok:false
// rather than throwing, so the JSON-RPC layer can report them honestly.
export async function callTool(name: string, args: unknown): Promise<McpToolResult> {
  try {
    switch (name) {
      case "hunt_leads": {
        const parsed = huntArgs.safeParse(args ?? {});
        if (!parsed.success) return { ok: false, error: `Invalid arguments: ${parsed.error.issues[0]?.message}` };
        return { ok: true, data: await huntLeadsTool(parsed.data) };
      }
      case "list_leads": {
        const parsed = listArgs.safeParse(args ?? {});
        if (!parsed.success) return { ok: false, error: `Invalid arguments: ${parsed.error.issues[0]?.message}` };
        return { ok: true, data: await listLeadsTool(parsed.data) };
      }
      case "score_lead": {
        const parsed = scoreArgs.safeParse(args ?? {});
        if (!parsed.success) return { ok: false, error: `Invalid arguments: ${parsed.error.issues[0]?.message}` };
        return { ok: true, data: scoreLeadTool(parsed.data) };
      }
      case "build_dossier": {
        const parsed = dossierArgs.safeParse(args ?? {});
        if (!parsed.success) return { ok: false, error: `Invalid arguments: ${parsed.error.issues[0]?.message}` };
        return { ok: true, data: await buildDossierTool(parsed.data) };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}
