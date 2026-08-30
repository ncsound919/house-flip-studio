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
  source: "assessed_value" | "sqft_median" | "combined" | "not_enough_data";
  confidence: "low" | "medium" | null;
  disclaimer: string;
  inputs: { assessedValue?: number; sqft?: number; county: string };
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
}): ArvEstimate {
  const { county } = params;
  const assessedValue =
    params.assessedValue != null && Number.isFinite(params.assessedValue) && params.assessedValue > 0
      ? params.assessedValue
      : undefined;
  const sqft =
    params.sqft != null && Number.isFinite(params.sqft) && params.sqft > 0 ? params.sqft : undefined;

  const signals: string[] = [];
  const disclaimer = ARV_DISCLAIMER;

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
