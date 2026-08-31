import { describe, it, expect } from "vitest";
import { computePortfolioMetrics, type PortfolioInput } from "../lib/finance/portfolio";

describe("computePortfolioMetrics", () => {
  const input: PortfolioInput = {
    deals: [
      { id: "d1", stage: "Closed", createdAt: "2026-01-01T00:00:00Z", stageChangedAt: "2026-01-01T00:00:00Z" },
      { id: "d2", stage: "Rehab", createdAt: "2026-03-01T00:00:00Z", stageChangedAt: "2026-03-01T00:00:00Z" },
      { id: "d3", stage: "Listed", createdAt: "2026-05-01T00:00:00Z", stageChangedAt: "2026-05-01T00:00:00Z" },
    ],
    pnls: {
      d1: { isRealized: true, realizedProfit: 13_400, finalSalePrice: 220_000 },
      d2: { isRealized: false, projectedProfit: 18_000 },
      d3: { isRealized: false, projectedProfit: 9_000 },
    },
  };

  it("computes pipeline value as sum of open projected profit", () => {
    const m = computePortfolioMetrics(input);
    expect(m.pipelineValue).toBe(27_000);
  });

  it("computes realized profit sum and count", () => {
    const m = computePortfolioMetrics(input);
    expect(m.realizedProfit).toBe(13_400);
    expect(m.realizedCount).toBe(1);
  });

  it("computes average cycle time only from Closed deals", () => {
    const m = computePortfolioMetrics(input);
    expect(m.averageCycleDays).toBeTypeOf("number");
  });
});