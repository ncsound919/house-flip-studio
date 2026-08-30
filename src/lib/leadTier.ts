import type { ListingCard } from "@/lib/listingSources/types";
import { scoreLead, type LeadScore } from "@/lib/leadScoring";

// Lead quality tier — combines the deterministic score with the motivation
// signals. This is the headline label on a new lead ("HOT", "WARM", "COLD")
// so the operator can triage in seconds.
//
// HONESTY: this is a documented, editable heuristic. It does NOT claim a lead
// is a good deal. It is a signal to prioritize review. ARV is still unknown
// (the codebase refuses to invent it), so any "tier" is a feasibility signal,
// not a verdict.

export type LeadTier = "hot" | "warm" | "cold";

// Combines score + motivation signals. Editable, NOT LLM.
export function tierForLead(
  card: Pick<ListingCard, "price" | "sqft" | "county"> & {
    motivation?: Partial<ListingCard["motivation"]> | null;
  },
  score: LeadScore
): LeadTier {
  // A "hot" lead: high score + at least 2 motivation signals.
  if (score.rating === "high" && (card.motivation?.reasonCount ?? 0) >= 2) return "hot";
  // Hot also when score is high AND the lead has an out-of-state owner
  // (out-of-state owners are the strongest motivation signal we have).
  if (score.rating === "high" && card.motivation?.outOfStateOwner) return "hot";
  // Warm: medium score + at least 1 motivation, or high score alone.
  if (score.rating === "high") return "warm";
  if (score.rating === "medium" && (card.motivation?.reasonCount ?? 0) >= 1) return "warm";
  return "cold";
}

export function tierLabel(tier: LeadTier): string {
  if (tier === "hot") return "HOT LEAD";
  if (tier === "warm") return "WARM LEAD";
  return "COLD LEAD";
}

// Convenience: full pipeline (score + tier) for a listing card.
export function scoreAndTier(card: ListingCard): { score: LeadScore; tier: LeadTier } {
  const score = scoreLead(card);
  return { score, tier: tierForLead(card, score) };
}
