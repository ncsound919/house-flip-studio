export interface DealPnlInput {
  stage: string;
  finalSalePrice?: number | null;
  purchasePrice?: number | null;
  acquisitionCosts?: number | null;
  rehabActual?: number | null;
  projectedRehab?: number | null;
  holdingMonths?: number | null;
  financingCosts?: number | null;
  sellingCosts?: number | null;
  projectedSellingCosts?: number | null;
  projectedArv?: number | null;
  projectedProfit?: number | null; // from underwriting row
}

export interface DealPnl {
  stage: string;
  isRealized: boolean;
  label: "realized" | "projected";
  finalSalePrice: number | null;
  realizedProfit: number | null;
  projectedProfit: number | null;
  totalActualCost: number | null;
  roi: number | null;
}

const num = (n: number | null | undefined) =>
  Number.isFinite(n) && n != null ? Number(n) : 0;

// DETERMINISTIC: realized P&L only from Closed deals with a real sale price.
// Open deals are projected from underwriting rows and labeled as such.
export function computeDealPnl(input: DealPnlInput): DealPnl {
  const isRealized = input.stage === "Closed" && Number(input.finalSalePrice) > 0;
  if (isRealized) {
    const sale = num(input.finalSalePrice);
    const totalActualCost =
      num(input.purchasePrice) +
      num(input.acquisitionCosts) +
      num(input.rehabActual) +
      num(input.financingCosts) +
      num(input.sellingCosts);
    const realizedProfit = Math.round(sale - totalActualCost);
    const roi = totalActualCost > 0 ? Math.round((realizedProfit / totalActualCost) * 100) : null;
    return {
      stage: input.stage,
      isRealized: true,
      label: "realized",
      finalSalePrice: sale,
      realizedProfit,
      projectedProfit: null,
      totalActualCost: Math.round(totalActualCost),
      roi,
    };
  }
  // Projected: use the underwriting projected profit if present, else derive.
  const projectedProfit =
    num(input.projectedProfit) > 0
      ? Math.round(num(input.projectedProfit))
      : Math.round(num(input.projectedArv) - (
          num(input.purchasePrice) +
          num(input.acquisitionCosts) +
          num(input.projectedRehab) +
          num(input.projectedSellingCosts) +
          num(input.financingCosts)
        ));
  return {
    stage: input.stage,
    isRealized: false,
    label: "projected",
    finalSalePrice: null,
    realizedProfit: null,
    projectedProfit,
    totalActualCost: null,
    roi: null,
  };
}