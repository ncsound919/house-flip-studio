// Deal capital-stack waterfall — deterministic exit math.
//
// Given a deal's funding stack (senior debt + partner capital + operator
// equity) and net exit proceeds, compute what each layer gets paid and its
// return. Seniority is by `priority` (0 = paid first). Operator equity is the
// residual claimant — it absorbs losses, so a short sale means a negative
// equity return rather than a fabricated profit.
//
// Simple-interest accrual on debt interest and partner preferred return. This
// is an honest, editable model — not a substitute for the legal waterfall in a
// real partnership agreement.

export interface StackLayer {
  kind: "debt" | "partner" | "equity";
  name: string;
  principal: number;
  annualRate: number; // % per year (0 for pure operator equity)
  priority: number; // 0 = most senior; equity should be last
}

export interface WaterfallInput {
  layers: StackLayer[];
  exitProceeds: number; // net sale proceeds after selling costs
  monthsHeld: number;
}

export interface LayerResult {
  kind: StackLayer["kind"];
  name: string;
  principal: number;
  accruedReturn: number;
  payout: number;
  returnAmt: number; // payout - principal (negative = loss for equity)
  roiPct: number | null;
  paidInFull: boolean;
}

export interface WaterfallResult {
  layers: LayerResult[];
  totalSeniorPayout: number;
  operatorResidual: number;
  isDeficit: boolean;
}

const round = (n: number) => Math.round(n);

export function computeWaterfall(input: WaterfallInput): WaterfallResult {
  const sorted = [...input.layers].sort((a, b) => a.priority - b.priority);
  // Net proceeds can be negative (sale price below closing costs) — clamp so no
  // layer is ever "paid" a negative amount; everything gets 0 and equity absorbs
  // the full loss.
  let proceeds = Math.max(0, input.exitProceeds);
  const layers: LayerResult[] = [];
  let totalSeniorPayout = 0;
  let isDeficit = false;

  for (const layer of sorted) {
    const accrued =
      layer.kind === "equity" ? 0 : (layer.principal * (layer.annualRate / 100) * input.monthsHeld) / 12;
    const required = layer.principal + accrued;

    if (layer.kind === "equity") {
      // Residual claimant: gets whatever proceeds remain (may be < principal).
      const payout = Math.max(0, proceeds);
      const returnAmt = payout - layer.principal;
      layers.push({
        kind: layer.kind,
        name: layer.name,
        principal: layer.principal,
        accruedReturn: 0,
        payout: round(payout),
        returnAmt: round(returnAmt),
        roiPct: layer.principal > 0 ? Math.round((returnAmt / layer.principal) * 100) : null,
        paidInFull: payout >= layer.principal,
      });
      proceeds = Math.max(0, proceeds - payout);
      continue;
    }

    const paid = Math.min(proceeds, required);
    const returnAmt = paid - layer.principal;
    layers.push({
      kind: layer.kind,
      name: layer.name,
      principal: layer.principal,
      accruedReturn: round(accrued),
      payout: round(paid),
      returnAmt: round(returnAmt),
      roiPct: layer.principal > 0 ? Math.round((returnAmt / layer.principal) * 100) : null,
      paidInFull: paid >= required,
    });
    totalSeniorPayout += paid;
    proceeds -= paid;
    if (paid < required) isDeficit = true;
  }

  return {
    layers,
    totalSeniorPayout: round(totalSeniorPayout),
    operatorResidual: round(Math.max(0, proceeds)),
    isDeficit,
  };
}
