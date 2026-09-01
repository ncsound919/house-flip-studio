import { describe, it, expect } from "vitest";
import { computeWaterfall, type StackLayer } from "../lib/finance/waterfall";

const equity: StackLayer = { kind: "equity", name: "Operator", principal: 20_000, annualRate: 0, priority: 99 };

describe("computeWaterfall", () => {
  it("pays senior debt + partner preferred return before operator residual", () => {
    const r = computeWaterfall({
      layers: [
        { kind: "debt", name: "Hard money", principal: 100_000, annualRate: 12, priority: 0 },
        { kind: "partner", name: "LP", principal: 30_000, annualRate: 10, priority: 1 },
        equity,
      ],
      exitProceeds: 170_000,
      monthsHeld: 6,
    });
    const debt = r.layers.find((l) => l.kind === "debt")!;
    const partner = r.layers.find((l) => l.kind === "partner")!;
    const op = r.layers.find((l) => l.kind === "equity")!;
    expect(debt.payout).toBe(106_000); // 100k + 12%/yr * 6mo
    expect(debt.returnAmt).toBe(6_000);
    expect(partner.payout).toBe(31_500); // 30k + 10%/yr * 6mo
    expect(partner.returnAmt).toBe(1_500);
    expect(op.payout).toBe(32_500); // 170k - 106k - 31.5k
    expect(op.returnAmt).toBe(12_500);
    expect(op.roiPct).toBe(63);
    expect(r.isDeficit).toBe(false);
  });

  it("operator equity absorbs the loss on a short exit", () => {
    const r = computeWaterfall({
      layers: [
        { kind: "debt", name: "Hard money", principal: 100_000, annualRate: 12, priority: 0 },
        equity,
      ],
      exitProceeds: 98_000,
      monthsHeld: 6,
    });
    const op = r.layers.find((l) => l.kind === "equity")!;
    expect(op.payout).toBe(0);
    expect(op.returnAmt).toBe(-20_000);
    expect(r.operatorResidual).toBe(0);
  });

  it("flags a deficit when senior layers cannot be paid in full", () => {
    const r = computeWaterfall({
      layers: [{ kind: "debt", name: "Hard money", principal: 100_000, annualRate: 0, priority: 0 }, equity],
      exitProceeds: 90_000,
      monthsHeld: 0,
    });
    expect(r.isDeficit).toBe(true);
    expect(r.layers.find((l) => l.kind === "debt")!.paidInFull).toBe(false);
  });

  it("orders payment by priority, not list order", () => {
    const r = computeWaterfall({
      layers: [
        equity, // listed first but highest priority (paid last)
        { kind: "partner", name: "LP", principal: 10_000, annualRate: 0, priority: 1 },
        { kind: "debt", name: "Bank", principal: 50_000, annualRate: 0, priority: 0 },
      ],
      exitProceeds: 80_000,
      monthsHeld: 0,
    });
    const op = r.layers.find((l) => l.kind === "equity")!;
    expect(op.payout).toBe(20_000); // 80k - 50k - 10k
  });
});
