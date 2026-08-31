import { medianPricePerSqft } from "@/lib/leadScoring";

// ARV (after-repair value) estimation — DETERMINISTIC and HONEST.
//
// We do NOT have a real comps/MLS feed. So ARV here is an ESTIMATE built from
// public-record signals (county assessed value, sqft vs county median $/sqft),
// clearly labeled as such. It is a feasibility signal for the agent to run
// underwriting, NOT a verified appraisal. Anything that depends on it carries
// the same label downstream.
//
// Sources of truth:
//   - sqft × county median $/sqft  (benchmark table in leadScoring.ts, editable)
//   - assessed value × assessment-to-market ratio (documented below, editable)
//
// Neither is a substitute for a real comps report. The agent treats the result
// as an estimate and never writes it to a "verified" field.

export interface ArvEstimate {
  arv: number | null;
  source: "assessed_value" | "sqft_median" | "combined" | "comps" | "not_enough_data";
  confidence: "low" | "medium" | "high" | null;
  disclaimer: string;
  inputs: { assessedValue?: number; sqft?: number; county: string; compCount?: number };
  signals: string[];
}

// NC counties revalue on cycles of 4–8 years; assessed values lag market.
// A conservative documented ratio of assessed → estimated market value.
// Per-county, editable, NOT scraped or invented live.
const ASSESSMENT_TO_MARKET: Record<string, number> = {
  Mecklenburg: 1.0, // revalues frequently; assessed tracks market decently
  Wake: 1.0,
  Durham: 1.0,
  Guilford: 1.0,
  default: 1.0,
};

const ARV_DISCLAIMER =
  "Estimated ARV from public records — not a verified appraisal. Confirm with a comps report before making an offer.";

export function assessmentToMarket(county: string): number {
  return ASSESSMENT_TO_MARKET[county] ?? ASSESSMENT_TO_MARKET.default;
}

export function estimateArv(params: {
  county: string;
  assessedValue?: number | null;
  sqft?: number | null;
  comps?: Array<{ sale_price: number | null; sale_date?: string | null; source?: string | null }> | null;
}): ArvEstimate {
  const { county } = params;
  const assessedValue =
    params.assessedValue != null && Number.isFinite(params.assessedValue) && params.assessedValue > 0
      ? params.assessedValue
      : undefined;
  const sqft =
    params.sqft != null && Number.isFinite(params.sqft) && params.sqft > 0 ? params.sqft : undefined;
  const compEntries = (params.comps ?? [])
    .map((c) => ({
      price: Number(c.sale_price),
      date: c.sale_date ? new Date(c.sale_date + (c.sale_date.length === 10 ? "T00:00:00" : "")) : null,
    }))
    .filter((c) => Number.isFinite(c.price) && c.price > 0);

  const signals: string[] = [];
  const disclaimer = ARV_DISCLAIMER;

  // Real comps beat heuristics whenever at least 2 are on file. Still an
  // estimate — comps are entered by the operator or a provider, not an appraisal.
  // Confidence weights count AND recency: 4+ comps with 3+ within 12 months is
  // high; otherwise medium. Recency is real math on real sale dates, not a knob.
  if (compEntries.length >= 2) {
    const now = Date.now();
    const fresh = compEntries.filter((c) => c.date && now - c.date.getTime() <= 365 * 86_400_000).length;
    const sorted = [...compEntries.map((c) => c.price)].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    const arv = Math.round(median);
    const confidence: "medium" | "high" = compEntries.length >= 4 && fresh >= 3 ? "high" : "medium";
    signals.push(`Median of ${compEntries.length} real comps: $${arv.toLocaleString("en-US")} (${fresh} within 12 months)`);
    return {
      arv,
      source: "comps",
      confidence,
      disclaimer,
      inputs: { assessedValue, sqft, county, compCount: compEntries.length },
      signals,
    };
  }

  const fromAssessed = (): ArvEstimate => {
    const arv = Math.round(assessedValue! * assessmentToMarket(county));
    signals.push(`Assessed $${assessedValue!.toLocaleString("en-US")} × ${assessmentToMarket(county)} ratio`);
    return {
      arv,
      source: "assessed_value",
      confidence: "low",
      disclaimer,
      inputs: { assessedValue, county },
      signals,
    };
  };

  const fromSqft = (): ArvEstimate => {
    const median = medianPricePerSqft(county);
    const arv = Math.round(sqft! * median);
    signals.push(`${sqft!.toLocaleString("en-US")} sqft × county median $${median}/sqft`);
    return {
      arv,
      source: "sqft_median",
      confidence: "medium",
      disclaimer,
      inputs: { sqft, county },
      signals,
    };
  };

  const combined = (): ArvEstimate => {
    // Blend both signals. Median is a market benchmark; assessed is the county's
    // own (lagged) valuation. Average them, trusting neither alone.
    const fromAssessedVal = assessedValue! * assessmentToMarket(county);
    const fromSqftVal = sqft! * medianPricePerSqft(county);
    const arv = Math.round((fromAssessedVal + fromSqftVal) / 2);
    signals.push(
      `Blend: assessed-derived $${fromAssessedVal.toLocaleString("en-US")} + sqft-derived $${fromSqftVal.toLocaleString("en-US")}`
    );
    return {
      arv,
      source: "combined",
      confidence: "medium",
      disclaimer,
      inputs: { assessedValue, sqft, county },
      signals,
    };
  };

  if (assessedValue && sqft) return combined();
  if (assessedValue) return fromAssessed();
  if (sqft) return fromSqft();

  return {
    arv: null,
    source: "not_enough_data",
    confidence: null,
    disclaimer,
    inputs: { county },
    signals: ["Not enough data: need assessed value or sqft to estimate ARV"],
  };
}
