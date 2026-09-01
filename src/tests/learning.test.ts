import { describe, it, expect } from "vitest";
import { distillLessons, lessonId, slugify } from "../lib/learning/lessons";
import { snapshotMarketInsights } from "../lib/learning/trends";
import type { MarketCalibration } from "../lib/finance/calibration";

describe("slugify / lessonId", () => {
  it("produces stable lowercase lesson ids", () => {
    expect(slugify("ARV Accuracy")).toBe("arv_accuracy");
    expect(lessonId("calibration", "ARV accuracy", true)).toBe("ls_calibration_arv_accuracy_ok");
  });
});

describe("distillLessons", () => {
  it("clusters outcomes by kind/summary/success with real evidence counts", () => {
    const lessons = distillLessons([
      { kind: "calibration", summary: "ARV accuracy", detail: "100 Main: 95%", success: true },
      { kind: "calibration", summary: "ARV accuracy", detail: "200 Oak: 88%", success: true },
      { kind: "calibration", summary: "ARV accuracy", detail: "300 Pine: 70%", success: false },
      { kind: "calibration", summary: "Rehab cost", detail: "100 Main: +20%", success: false },
    ]);
    expect(lessons).toHaveLength(3);
    const ok = lessons.find((l) => l.id === "ls_calibration_arv_accuracy_ok");
    expect(ok?.evidence_count).toBe(2);
    expect(ok?.pattern).toContain("within tolerance");
    const issue = lessons.find((l) => l.id === "ls_calibration_arv_accuracy_issue");
    expect(issue?.evidence_count).toBe(1);
    expect(issue?.lesson).toContain("70%");
  });

  it("sorts by evidence count descending", () => {
    const lessons = distillLessons([
      { kind: "a", summary: "x", detail: "1", success: true },
      { kind: "a", summary: "x", detail: "2", success: true },
      { kind: "b", summary: "y", detail: "3", success: false },
    ]);
    expect(lessons[0].evidence_count).toBe(2);
  });
});

describe("snapshotMarketInsights", () => {
  const market: MarketCalibration = {
    sampleSize: 2,
    arvAccuracyAvg: 103,
    rehabVarianceAvg: 12,
    profitAccuracyAvg: 95,
    actualRehabPerSqft: 48,
    rehabPerSqftVsBaselinePct: 20,
    overProjectedCount: 1,
    underProjectedCount: 1,
  };

  it("emits one deterministic row per metric with sample sizes", () => {
    const rows = snapshotMarketInsights(
      [
        { dealId: "a", address: "1", arv: null, rehab: null, profit: null, holdMonths: { projected: 6, actual: 5 }, rehabPerSqft: 40 },
      ],
      market,
      "2026-09-01"
    );
    const metrics = new Set(rows.map((r) => r.metric));
    expect(metrics.has("arv_accuracy_pct")).toBe(true);
    expect(metrics.has("rehab_per_sqft")).toBe(true);
    expect(metrics.has("hold_months_avg")).toBe(true);
    expect(rows.every((r) => r.window_start === "2026-09-01")).toBe(true);
    const arv = rows.find((r) => r.metric === "arv_accuracy_pct");
    expect(arv?.value).toBe(103);
    expect(arv?.sample_size).toBe(2);
  });

  it("omits null signals honestly", () => {
    const rows = snapshotMarketInsights([], { ...market, sampleSize: 0, arvAccuracyAvg: null, actualRehabPerSqft: null }, "2026-09-01");
    expect(rows.length).toBe(0);
  });
});
