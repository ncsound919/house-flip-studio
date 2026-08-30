import { describe, it, expect } from "vitest";
import { estimateArv, assessmentToMarket } from "../lib/arvEstimate";

describe("estimateArv", () => {
  it("returns sqft-based estimate when sqft is present", () => {
    const r = estimateArv({ county: "Mecklenburg", sqft: 1500 });
    expect(r.arv).not.toBeNull();
    expect(r.arv).toBeGreaterThan(0);
    expect(r.source).toBe("sqft_median");
    expect(r.confidence).toBe("medium");
    expect(r.disclaimer).toContain("not a verified appraisal");
    expect(r.signals).toContainEqual(expect.stringContaining("sqft"));
  });

  it("returns assessed-based estimate when only assessed is present", () => {
    const r = estimateArv({ county: "Wake", assessedValue: 100_000 });
    expect(r.arv).not.toBeNull();
    expect(r.arv).toBeGreaterThan(0);
    expect(r.source).toBe("assessed_value");
    expect(r.confidence).toBe("low");
    expect(r.signals).toContainEqual(expect.stringContaining("Assessed"));
  });

  it("returns combined estimate when both sqft and assessed are present", () => {
    const r = estimateArv({ county: "Wake", assessedValue: 80_000, sqft: 1500 });
    expect(r.arv).not.toBeNull();
    expect(r.source).toBe("combined");
    expect(r.confidence).toBe("medium");
    expect(r.signals).toContainEqual(expect.stringContaining("Blend"));
  });

  it("returns not_enough_data when neither sqft nor assessed is present", () => {
    const r = estimateArv({ county: "Guilford" });
    expect(r.arv).toBeNull();
    expect(r.source).toBe("not_enough_data");
    expect(r.confidence).toBeNull();
  });

  it("uses unknown county with default benchmark", () => {
    const r = estimateArv({ county: "Avery", sqft: 2000 });
    expect(r.arv).not.toBeNull();
    expect(r.arv).toBe(2000 * 185); // default median
  });

  it("always carries the honesty disclaimer", () => {
    for (const opts of [
      { county: "Mecklenburg", sqft: 1500 },
      { county: "Durham", assessedValue: 120_000 },
      { county: "Guilford" },
    ]) {
      const r = estimateArv(opts);
      expect(r.disclaimer).toContain("Estimated");
      expect(r.disclaimer).toContain("not a verified");
    }
  });

  it("never returns negative or zero ARV for valid inputs", () => {
    const r = estimateArv({ county: "Wake", sqft: 1 });
    expect(r.arv).toBeGreaterThan(0);
  });

  it("ignores null and undefined values gracefully", () => {
    const r = estimateArv({ county: "Durham", sqft: null, assessedValue: undefined });
    expect(r.source).toBe("not_enough_data");
  });
});

describe("assessmentToMarket", () => {
  it("returns documented ratio per county", () => {
    expect(assessmentToMarket("Mecklenburg")).toBe(1.0);
    expect(assessmentToMarket("Wake")).toBe(1.0);
    expect(assessmentToMarket("Durham")).toBe(1.0);
    expect(assessmentToMarket("Guilford")).toBe(1.0);
  });

  it("falls back to default for unknown county", () => {
    expect(assessmentToMarket("Avery")).toBe(1.0);
  });
});
