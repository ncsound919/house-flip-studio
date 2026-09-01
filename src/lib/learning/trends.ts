// Market trends — Draymond's trends-store pattern (deterministic time-series
// of derived signals), ported to real-estate metrics. Each sync appends one
// snapshot per metric so the operator can see whether accuracy is improving.

import type { DealCalibration, MarketCalibration } from "@/lib/finance/calibration";

export interface MarketInsightRow {
  metric: string;
  value: number;
  sample_size: number;
  source: string;
  window_start: string; // date
}

export function snapshotMarketInsights(
  deals: DealCalibration[],
  market: MarketCalibration,
  windowStart?: string
): MarketInsightRow[] {
  const today = windowStart ?? new Date().toISOString().slice(0, 10);
  const rows: MarketInsightRow[] = [];
  const push = (metric: string, value: number | null, sample: number) => {
    if (value == null || sample <= 0) return;
    rows.push({ metric, value, sample_size: sample, source: "calibration", window_start: today });
  };

  push("arv_accuracy_pct", market.arvAccuracyAvg, market.sampleSize);
  push("profit_accuracy_pct", market.profitAccuracyAvg, market.sampleSize);
  push("rehab_variance_pct", market.rehabVarianceAvg, market.sampleSize);
  push("rehab_per_sqft", market.actualRehabPerSqft, market.sampleSize);

  // Average actual hold months across closed deals with a recorded cycle.
  const holds = deals.filter((d) => d.holdMonths != null).map((d) => d.holdMonths!.actual);
  if (holds.length > 0) {
    push("hold_months_avg", Math.round(holds.reduce((s, n) => s + n, 0) / holds.length), holds.length);
  }

  return rows;
}
