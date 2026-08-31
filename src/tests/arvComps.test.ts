import { describe, it, expect } from "vitest";
import { estimateArv } from "../lib/arvEstimate";

describe("estimateArv with comps", () => {
  it("uses the median of 2+ comps as ARV", () => {
    const est = estimateArv({
      county: "Mecklenburg",
      assessedValue: 90_000,
      sqft: 1400,
      comps: [{ sale_price: 200_000 }, { sale_price: 220_000 }, { sale_price: 240_000 }],
    });
    expect(est.source).toBe("comps");
    expect(est.arv).toBe(220_000); // median of [200k,220k,240k]
    expect(est.confidence).toBe("medium");
    expect(est.inputs.compCount).toBe(3);
  });

  it("even-number comps uses the midpoint median", () => {
    const est = estimateArv({
      county: "Wake",
      comps: [{ sale_price: 180_000 }, { sale_price: 200_000 }],
    });
    expect(est.arv).toBe(190_000);
    expect(est.source).toBe("comps");
  });

  it("falls back to heuristic when fewer than 2 comps", () => {
    const est = estimateArv({
      county: "Mecklenburg",
      assessedValue: 90_000,
      sqft: 1400,
      comps: [{ sale_price: 200_000 }],
    });
    expect(est.source).not.toBe("comps");
    expect(est.arv).toBeGreaterThan(0);
  });

  it("ignores null/zero comp prices", () => {
    const est = estimateArv({
      county: "Guilford",
      comps: [{ sale_price: null }, { sale_price: 0 }, { sale_price: 150_000 }, { sale_price: 170_000 }],
    });
    expect(est.source).toBe("comps");
    expect(est.arv).toBe(160_000);
  });
});