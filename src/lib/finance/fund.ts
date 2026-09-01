// Fund rollup — deterministic capital-at-work totals across the portfolio.
// Splits deployed capital by source (operator equity, partner capital, senior
// debt) and separates active vs realized exposure.

export interface FundContribution {
  source_type: "operator_equity" | "partner_capital";
  amount: number;
  status: string;
}

export interface FundDebt {
  balance: number;
}

export interface FundDeal {
  stage: string;
}

export interface FundTotals {
  operatorEquity: number;
  partnerCapital: number;
  totalDebt: number;
  capitalDeployed: number; // equity + partner + debt
  activeDeals: number;
  closedDeals: number;
  partnerShareOfDeployed: number; // %
  equityAtRisk: number; // operator + partner capital on non-closed deals
}

export function computeFundTotals(
  contributions: FundContribution[],
  debts: FundDebt[],
  deals: FundDeal[]
): FundTotals {
  const active = contributions.filter((c) => c.status === "active");

  const operatorEquity = active
    .filter((c) => c.source_type === "operator_equity")
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const partnerCapital = active
    .filter((c) => c.source_type === "partner_capital")
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalDebt = debts.reduce((s, d) => s + (Number(d.balance) || 0), 0);

  const capitalDeployed = operatorEquity + partnerCapital + totalDebt;
  const activeDeals = deals.filter((d) => d.stage !== "Closed").length;
  const closedDeals = deals.length - activeDeals;
  const equityAtRisk = operatorEquity + partnerCapital;

  return {
    operatorEquity,
    partnerCapital,
    totalDebt,
    capitalDeployed,
    activeDeals,
    closedDeals,
    partnerShareOfDeployed: capitalDeployed > 0 ? Math.round((partnerCapital / capitalDeployed) * 100) : 0,
    equityAtRisk,
  };
}
