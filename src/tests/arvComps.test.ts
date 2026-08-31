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

describe("estimateArv — comps confidence", () => {
  const comps = [
    { sale_price: 200_000, source: "deeds", sale_date: "2026-05-01" },
    { sale_price: 210_000, source: "deeds", sale_date: "2026-04-15" },
    { sale_price: 205_000, source: "deeds", sale_date: "2026-03-01" },
  ];

  it("uses median sale price with medium confidence for >=3 comps", () => {
    const r = estimateArv({ county: "Wake", comps });
    expect(r.source).toBe("comps");
    expect(r.arv).toBe(205_000);
    expect(r.confidence).toBe("medium");
  });

  it("labels comp count and recency in signals", () => {
    const r = estimateArv({ county: "Wake", comps });
    expect(r.signals.join(" ")).toContain("3 real comps");
  });

  it("falls back to heuristic with <2 comps", () => {
    const r = estimateArv({ county: "Wake", assessedValue: 90_000, comps: [{ sale_price: 200_000 }] });
    expect(r.source).toBe("assessed_value");
  });

  it("marks high confidence when >=4 comps with >=3 within 12 months", () => {
    const fresh = [
      { sale_price: 200_000, source: "deeds", sale_date: "2026-05-01" },
      { sale_price: 210_000, source: "deeds", sale_date: "2026-04-15" },
      { sale_price: 205_000, source: "deeds", sale_date: "2026-03-01" },
      { sale_price: 198_000, source: "deeds", sale_date: "2026-02-01" },
    ];
    const r = estimateArv({ county: "Wake", comps: fresh });
    expect(r.source).toBe("comps");
    expect(r.confidence).toBe("high");
    expect(r.signals.join(" ")).toContain("within 12 months");
  });

  it("stays medium confidence when comps are stale (>12 months)", () => {
    const stale = [
      { sale_price: 200_000, source: "deeds", sale_date: "2023-01-01" },
      { sale_price: 210_000, source: "deeds", sale_date: "2022-05-01" },
      { sale_price: 205_000, source: "deeds", sale_date: "2022-03-01" },
      { sale_price: 198_000, source: "deeds", sale_date: "2021-11-01" },
    ];
    const r = estimateArv({ county: "Wake", comps: stale });
    expect(r.confidence).toBe("medium");
  });
});