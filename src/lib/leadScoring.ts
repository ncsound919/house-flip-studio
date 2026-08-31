import type { ListingCard } from "@/lib/listingSources/types";
import type { FlipProfile } from "@/lib/orgSettings";

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
  arvEstimate?: number;
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

const DEFAULT_FLIP_PROFILE: FlipProfile = {
  minAssessed: 30_000,
  maxAssessed: 150_000,
  statewide: true,
  counties: [],
  maxHuntPerRun: 200,
};

export function medianPricePerSqft(county: string): number {
  return COUNTY_MEDIAN_PRICE_PER_SQFT[county] ?? COUNTY_MEDIAN_PRICE_PER_SQFT.default;
}

export function scoreLead(listing: ListingCard, flipProfile?: FlipProfile): LeadScore {
  const profile = flipProfile ?? DEFAULT_FLIP_PROFILE;
  const { minAssessed, maxAssessed } = profile;
  const flags: string[] = [];
  let needsArv = true;
  let canAct = false;
  let score = 50;
  let pricePerSqft: number | undefined;
  let estimatedRehabPerSqft: number | undefined;
  let arvEstimate: number | undefined;

  if (listing.price != null && listing.sqft && listing.sqft > 0) {
    pricePerSqft = Math.round(listing.price / listing.sqft);
    estimatedRehabPerSqft = Math.round(listing.sqft * DEFAULT_REHAB_PER_SQFT);
    canAct = true;
    const median = medianPricePerSqft(listing.county);
    const ratio = pricePerSqft / median;
    if (ratio <= 0.75) score += 25;
    else if (ratio <= 0.95) score += 12;
    else if (ratio >= 1.3) { score -= 20; flags.push(`Priced ${Math.round(ratio * 100)}% of county median $/sqft`); }
    else if (ratio >= 1.1) score -= 8;
  } else if (listing.parcel?.assessedValue != null) {
    // County GIS data: assessed value is the price signal.
    // No ARV or sqft → use assessed value as price proxy for tier scoring.
    const av = listing.parcel.assessedValue;
    // Target tier: within the operator's flip profile band.
    // Score based on where within the band the property sits.
    const range = Math.max(1, maxAssessed - minAssessed);
    const lowThird = minAssessed + range / 3;
    if (av >= minAssessed && av <= maxAssessed) {
      // Sweet spot — right in the flip budget range.
      if (av <= lowThird) score += 20; // cheap third → more margin for rehab
      else if (av <= minAssessed + (2 * range) / 3) score += 15;
      else score += 10;
      canAct = true; // operator can underwrite once ARV is confirmed
    } else if (av < minAssessed) {
      score -= 30; flags.push(`Assessed value ${av.toLocaleString()} below $${minAssessed.toLocaleString()} — likely lot, not house`);
    } else {
      score -= 10; flags.push(`Assessed value ${av.toLocaleString()} above $${maxAssessed.toLocaleString()} — outside flip range`);
    }

    // County GIS has no heated sqft → estimated rehab is a fixed placeholder.
    estimatedRehabPerSqft = 40_000;
    needsArv = true;
  } else {
    flags.push("No price listed"); score -= 10;
  }

  // Structure year signal.
  if (listing.year_built != null) {
    if (listing.year_built < 1960) {
      flags.push("Built before 1960 — expect structural/mechanical surprises"); score -= 5;
    } else if (listing.year_built > 2010) {
      score -= 5; flags.push("Newer construction — less distressed, less margin");
    }
    // Older homes (pre-1980) have more rehab upside.
    if (listing.year_built > 0 && listing.year_built < 1980) score += 5;
  }

  // Motivation signals — the "why cheap" factors that make a deal real.
  const m = listing.motivation;
  if (m?.absenteeOwner) { score += 8; flags.push("Absentee owner — motivated seller signal"); }
  if (m?.longHeld) { score += 10; flags.push("Long-held — low basis, potential seller financing"); }
  if (m?.olderHome) score += 5;
  if (m?.multiParcelOwner) { score += 10; flags.push("Multi-parcel owner — portfolio, may be motivated to sell"); }
  if (m?.taxDelinquent) { score += 12; flags.push("tax delinquent — distress signal, potential lien/title risk"); }

  // Acreage — large lots suggest rural/land deals, not house flips.
  if (listing.parcel?.acreage != null && listing.parcel.acreage > 5) {
    score -= 15; flags.push(`Rural acreage (${listing.parcel.acreage} ac) — not a standard flip`);
  }

  // Beds/baths for MLS records.
  if (listing.beds != null && listing.beds < 2) score -= 5;
  if (listing.beds == null) flags.push("Bed count unknown");

  const attentionScore = clamp(Math.round(score), 0, 100);
  const rating: "high" | "medium" | "low" =
    attentionScore >= 70 ? "high" : attentionScore >= 45 ? "medium" : "low";

  return {
    attentionScore,
    pricePerSqft,
    estimatedRehabPerSqft,
    arvEstimate,
    flags,
    needsArv,
    canAct,
    rating,
  };
}
