import type { ListingCard } from "@/lib/listingSources/types";

// Lead scoring — DETERMINISTIC and HONEST.
//
// We do NOT have ARV (after-repair value) for a scraped listing, and the 70%
// rule is meaningless without it. So this returns a *feasibility signal*, not
// a verdict:
//   - attentionScore (0-100): how much this listing is worth a closer look,
//     from known fields only (price, sqft, beds/baths, year built).
//   - redFlags: anything that makes it riskier.
//   - needsArv: true whenever ARV is unknown — always true for scraped leads,
//     because we refuse to invent ARV.
//
// The score is a signal to prioritize review, NOT "this is a good deal."

export interface LeadScore {
  attentionScore: number; // 0-100
  pricePerSqft?: number;
  estimatedRehabPerSqft?: number;
  flags: string[];
  needsArv: boolean;
  canAct: boolean; // enough data to actually run underwriting?
  rating: "high" | "medium" | "low";
}

// County median price/sqft benchmarks (from public market data, conservative).
// These are documented assumptions, editable, NOT scraped or invented live.
const COUNTY_MEDIAN_PRICE_PER_SQFT: Record<string, number> = {
  Mecklenburg: 210,
  Wake: 215,
  Durham: 200,
  Guilford: 160,
  default: 185,
};

const DEFAULT_REHAB_PER_SQFT = 40; // mid-tier flip rehab assumption

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, n));

export function medianPricePerSqft(county: string): number {
  return COUNTY_MEDIAN_PRICE_PER_SQFT[county] ?? COUNTY_MEDIAN_PRICE_PER_SQFT.default;
}

export function scoreLead(listing: ListingCard): LeadScore {
  const flags: string[] = [];
  const needsArv = true; // scraped data never includes a trustworthy ARV

  // Known-field signal. Score starts at 50, moves on evidence we trust.
  let score = 50;

  if (listing.price != null && listing.sqft && listing.sqft > 0) {
    const ppsf = listing.price / listing.sqft;
    const median = medianPricePerSqft(listing.county);
    const ratio = ppsf / median;

    if (ratio <= 0.75) {
      score += 25; // well below county median $/sqft — worth a look
    } else if (ratio <= 0.95) {
      score += 12; // below median
    } else if (ratio >= 1.3) {
      score -= 20; // well above median — likely not a flip
      flags.push(`Priced ${Math.round(ratio * 100)}% of county median $/sqft`);
    } else if (ratio >= 1.1) {
      score -= 8;
    }
  } else if (listing.price == null) {
    flags.push("No price listed");
    score -= 10;
  } else {
    flags.push("No sqft listed — price/sqft unknown");
    score -= 5;
  }

  if (listing.year_built != null && listing.year_built > 1985) {
    score += 5; // newer = less structural risk
  } else if (listing.year_built != null && listing.year_built < 1960) {
    flags.push("Built before 1960 — expect structural/mechanical surprises");
    score -= 5;
  }

  // Beds/baths sanity
  if (listing.beds != null && listing.beds < 2) {
    score -= 5;
  }
  if (listing.beds == null) {
    flags.push("Bed count unknown");
  }

  const attentionScore = clamp(Math.round(score), 0, 100);
  const rating =
    attentionScore >= 70 ? "high" : attentionScore >= 45 ? "medium" : "low";

  const canAct =
    listing.price != null &&
    listing.sqft != null &&
    listing.sqft > 0;

  return {
    attentionScore,
    pricePerSqft:
      listing.price != null && listing.sqft && listing.sqft > 0
        ? Math.round(listing.price / listing.sqft)
        : undefined,
    estimatedRehabPerSqft: listing.sqft
      ? Math.round(listing.sqft * DEFAULT_REHAB_PER_SQFT)
      : undefined,
    flags,
    needsArv,
    canAct,
    rating,
  };
}
