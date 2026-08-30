export interface UnderwritingInput {
  arv: number;
  rehabEstimate: number;
  purchasePrice: number;
  holdingMonths: number;
  downPaymentPct: number;
  interestRate: number;
  loanPoints: number;
}

export interface UnderwritingResult {
  maxOffer: number;
  finalPurchasePrice: number;
  passes70Rule: boolean;
  acquisitionCosts: number;
  holdingCosts: number;
  sellingCosts: number;
  financingCosts: number;
  totalProjectCost: number;
  projectedProfit: number;
  roi: number;
  cashOnCash: number;
  downPaymentAmount: number;
  loanAmount: number;
}

// Fixed assumptions (documented, deterministic — not LLM-computed).
const ACQUISITION_COST_PCT = 0.02; // title, closing, inspections
const HOLDING_COST_PCT_PER_MONTH = 0.0015; // taxes/insurance/utilities carry
const SELLING_COST_PCT = 0.08; // agent + closing at sale

const round2 = (n: number) => Math.round(n * 100) / 100;

function clampNonNegative(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function calculateUnderwriting(
  input: UnderwritingInput
): UnderwritingResult {
  const arv = clampNonNegative(input.arv);
  const rehabEstimate = clampNonNegative(input.rehabEstimate);
  const purchasePrice = clampNonNegative(input.purchasePrice);
  const holdingMonths = clampNonNegative(input.holdingMonths);
  const downPaymentPct = clampNonNegative(input.downPaymentPct);
  const interestRate = clampNonNegative(input.interestRate);
  const loanPoints = clampNonNegative(input.loanPoints);

  // 70% rule: max offer = ARV * 0.70 - rehab
  const maxOffer = round2(arv * 0.7 - rehabEstimate);

  // Does the asked purchase price pass the 70% rule on its own?
  const passes70Rule = purchasePrice <= maxOffer;

  // Purchase price cannot exceed the MAO
  const finalPurchasePrice = round2(
    Math.min(purchasePrice, Math.max(0, maxOffer))
  );

  // Costs
  const acquisitionCosts = round2(finalPurchasePrice * ACQUISITION_COST_PCT);
  // Per-month carrying cost (taxes, insurance, utilities)
  const holdingCosts = round2(
    finalPurchasePrice * HOLDING_COST_PCT_PER_MONTH
  );
  const sellingCosts = round2(arv * SELLING_COST_PCT);

  // Financing
  const downPaymentAmount = round2(
    finalPurchasePrice * Math.min(1, downPaymentPct / 100)
  );
  const loanAmount = round2(finalPurchasePrice - downPaymentAmount);
  const pointsCost = round2(loanAmount * (loanPoints / 100));
  const interestCost = round2(
    loanAmount * (interestRate / 100) * (holdingMonths / 12)
  );
  const financingCosts = round2(pointsCost + interestCost);

  // All-in
  const totalProjectCost = round2(
    finalPurchasePrice +
      rehabEstimate +
      acquisitionCosts +
      holdingCosts * holdingMonths +
      sellingCosts +
      financingCosts
  );

  const projectedProfit = round2(arv - totalProjectCost);

  const roi = totalProjectCost > 0 ? round2((projectedProfit / totalProjectCost) * 100) : 0;

  const cashInvested = round2(totalProjectCost - loanAmount);
  const cashOnCash =
    cashInvested > 0 ? round2((projectedProfit / cashInvested) * 100) : 0;

  return {
    maxOffer,
    finalPurchasePrice,
    passes70Rule,
    acquisitionCosts,
    holdingCosts,
    sellingCosts,
    financingCosts,
    totalProjectCost,
    projectedProfit,
    roi,
    cashOnCash,
    downPaymentAmount,
    loanAmount,
  };
}
