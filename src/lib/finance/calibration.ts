// Outcome flywheel — the proprietary data moat. Deterministic.
//
// Every CLOSED deal is compared against what underwriting projected:
//   ARV projection   vs actual sale price
//   rehab estimate   vs actual rehab spend
//   projected profit vs realized profit
//   projected hold   vs actual cycle time
//   actual rehab $/sqft (calibrates the default rehabPerSqft setting)
//
// This is the loop that makes the system get smarter over time. ChatGPT has no
// access to YOUR outcomes; this ledger is built only from real closes. Nothing
// is calibrated where a projection or actual is missing.

export interface CalibrationDealInput {
  id: string;
  address: string;
  sqft: number | null;
  finalSalePrice: number | null;
  projectedArv: number | null;
  projectedRehab: number | null;
  projectedProfit: number | null;
  projectedHoldMonths: number | null;
  actualRehab: number | null;
  realizedProfit: number | null;
  actualHoldMonths: number | null;
}

export interface CalibrationPoint {
  projected: number;
  actual: number;
  accuracyPct: number; // actual / projected * 100 (100 = exact, >100 = actual higher)
  variancePct: number; // (actual - projected) / projected * 100
}

export interface DealCalibration {
  dealId: string;
  address: string;
  arv: CalibrationPoint | null;
  rehab: CalibrationPoint | null;
  profit: CalibrationPoint | null;
  holdMonths: { projected: number; actual: number } | null;
  rehabPerSqft: number | null;
}

export interface MarketCalibration {
  sampleSize: number;
  arvAccuracyAvg: number | null; // mean accuracyPct
  rehabVarianceAvg: number | null; // mean variancePct
  profitAccuracyAvg: number | null;
  actualRehabPerSqft: number | null; // total actual rehab / total sqft
  rehabPerSqftVsBaselinePct: number | null; // actual $/sqft vs the operator's setting
  overProjectedCount: number; // realized profit below projection
  underProjectedCount: number; // realized profit above projection
}

function point(projected: number, actual: number | null): CalibrationPoint | null {
  if (!(projected > 0) || actual == null) return null;
  return {
    projected: Math.round(projected),
    actual: Math.round(actual),
    accuracyPct: Math.round((actual / projected) * 100),
    variancePct: Math.round(((actual - projected) / projected) * 100),
  };
}

export function calibrateDeal(d: CalibrationDealInput): DealCalibration {
  const rehabPerSqft =
    d.actualRehab != null && d.sqft != null && d.sqft > 0 ? Math.round(d.actualRehab / d.sqft) : null;
  return {
    dealId: d.id,
    address: d.address,
    arv: point(d.projectedArv ?? 0, d.finalSalePrice),
    rehab: point(d.projectedRehab ?? 0, d.actualRehab),
    profit: point(d.projectedProfit ?? 0, d.realizedProfit),
    holdMonths:
      d.projectedHoldMonths != null && d.actualHoldMonths != null
        ? { projected: d.projectedHoldMonths, actual: d.actualHoldMonths }
        : null,
    rehabPerSqft,
  };
}

export function computeCalibration(
  deals: CalibrationDealInput[],
  baselineRehabPerSqft = 40
): { deals: DealCalibration[]; market: MarketCalibration } {
  const rows = deals.map(calibrateDeal);

  const arvPoints = rows.filter((r) => r.arv != null).map((r) => r.arv!.accuracyPct);
  const rehabVariances = rows.filter((r) => r.rehab != null).map((r) => r.rehab!.variancePct);
  const profitPoints = rows.filter((r) => r.profit != null).map((r) => r.profit!.accuracyPct);

  const totalRehab = rows.reduce((s, r) => s + (r.rehab?.actual ?? 0), 0);
  const totalSqft = rows.reduce((s, r) => s + (r.rehabPerSqft != null ? deals.find((d) => d.id === r.dealId)?.sqft ?? 0 : 0), 0);
  const actualRehabPerSqft =
    totalRehab > 0 && totalSqft > 0 ? Math.round(totalRehab / totalSqft) : null;

  const mean = (arr: number[]) => (arr.length ? Math.round(arr.reduce((s, n) => s + n, 0) / arr.length) : null);

  return {
    deals: rows,
    market: {
      sampleSize: rows.length,
      arvAccuracyAvg: mean(arvPoints),
      rehabVarianceAvg: mean(rehabVariances),
      profitAccuracyAvg: mean(profitPoints),
      actualRehabPerSqft,
      rehabPerSqftVsBaselinePct:
        actualRehabPerSqft != null && baselineRehabPerSqft > 0
          ? Math.round(((actualRehabPerSqft - baselineRehabPerSqft) / baselineRehabPerSqft) * 100)
          : null,
      overProjectedCount: rows.filter((r) => r.profit != null && r.profit.actual < r.profit.projected).length,
      underProjectedCount: rows.filter((r) => r.profit != null && r.profit.actual > r.profit.projected).length,
    },
  };
}
