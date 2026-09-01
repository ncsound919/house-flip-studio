import { describe, it, expect } from "vitest";
import { calibrateDeal, computeCalibration, type CalibrationDealInput } from "../lib/finance/calibration";

const closed = (over: Partial<CalibrationDealInput> & { id: string }): CalibrationDealInput => ({
  id: over.id,
  address: over.address ?? "1 Test St",
  sqft: over.sqft ?? null,
  finalSalePrice: over.finalSalePrice ?? null,
  projectedArv: over.projectedArv ?? null,
  projectedRehab: over.projectedRehab ?? null,
  projectedProfit: over.projectedProfit ?? null,
  projectedHoldMonths: over.projectedHoldMonths ?? null,
  actualRehab: over.actualRehab ?? null,
  realizedProfit: over.realizedProfit ?? null,
  actualHoldMonths: over.actualHoldMonths ?? null,
});

describe("calibrateDeal", () => {
  it("computes ARV accuracy and rehab variance from projections vs actuals", () => {
    const d = calibrateDeal(
      closed({ id: "a", projectedArv: 200_000, finalSalePrice: 190_000, projectedRehab: 30_000, actualRehab: 36_000 })
    );
    expect(d.arv?.accuracyPct).toBe(95); // sold 5% below projected ARV
    expect(d.rehab?.variancePct).toBe(20); // 20% over estimate
  });

  it("omits points where either side is missing (no fabricated calibration)", () => {
    const d = calibrateDeal(closed({ id: "a", projectedArv: 200_000 }));
    expect(d.arv).toBeNull(); // no actual sale price
    expect(d.profit).toBeNull();
  });

  it("computes actual rehab per sqft", () => {
    const d = calibrateDeal(closed({ id: "a", sqft: 1_000, actualRehab: 40_000 }));
    expect(d.rehabPerSqft).toBe(40);
  });
});

describe("computeCalibration", () => {
  it("aggregates market-level accuracy from real closes", () => {
    const { market } = computeCalibration(
      [
        closed({ id: "a", projectedArv: 200_000, finalSalePrice: 190_000, projectedProfit: 20_000, realizedProfit: 15_000, sqft: 1_000, actualRehab: 40_000, projectedRehab: 40_000 }),
        closed({ id: "b", projectedArv: 150_000, finalSalePrice: 165_000, projectedProfit: 15_000, realizedProfit: 25_000, sqft: 1_200, actualRehab: 30_000, projectedRehab: 30_000 }),
      ],
      40
    );
    expect(market.sampleSize).toBe(2);
    expect(market.arvAccuracyAvg).toBe(103); // (95 + 110) / 2
    expect(market.profitAccuracyAvg).toBe(121); // (75 + 167) / 2
    expect(market.rehabVarianceAvg).toBe(0);
    expect(market.actualRehabPerSqft).toBe(32); // 70000 / 2200
    expect(market.rehabPerSqftVsBaselinePct).toBe(-20);
    expect(market.overProjectedCount).toBe(1);
    expect(market.underProjectedCount).toBe(1);
  });

  it("returns empty/nulls with no closed deals", () => {
    const { market } = computeCalibration([], 40);
    expect(market.sampleSize).toBe(0);
    expect(market.arvAccuracyAvg).toBeNull();
    expect(market.actualRehabPerSqft).toBeNull();
  });
});
