// Bank-readiness: debt schedule aggregates. Deterministic.
// Weighted rate is a real weighted average over balances (never an average of
// rates); monthly obligations are the real sum of scheduled payments.

export const DEBT_KINDS = [
  "heloc",
  "hard_money",
  "note",
  "construction",
  "credit_card",
  "other",
] as const;

export type DebtKind = (typeof DEBT_KINDS)[number];

export interface DebtRow {
  id: string;
  lender: string;
  kind: DebtKind;
  balance: number;
  interest_rate: number | null;
  monthly_payment: number | null;
  maturity_date: string | null;
  collateral_deal_id: string | null;
  notes: string | null;
  deals?: { id: string; address: string } | null;
}

export interface DebtTotals {
  count: number;
  totalBalance: number;
  weightedRate: number | null;
  monthlyObligations: number;
  securedCount: number;
}

export function computeDebtTotals(debts: DebtRow[]): DebtTotals {
  const count = debts.length;
  const totalBalance = debts.reduce((s, d) => s + (Number(d.balance) || 0), 0);

  let weightedRate: number | null = null;
  if (totalBalance > 0) {
    const numerator = debts.reduce(
      (s, d) => s + (Number(d.balance) || 0) * (Number(d.interest_rate) || 0),
      0
    );
    weightedRate = Math.round((numerator / totalBalance) * 10) / 10;
  }

  const monthlyObligations = debts.reduce(
    (s, d) => s + (Number(d.monthly_payment) || 0),
    0
  );

  const securedCount = debts.filter((d) => d.collateral_deal_id).length;

  return { count, totalBalance, weightedRate, monthlyObligations, securedCount };
}
