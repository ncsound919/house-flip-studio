// Bank-readiness: company balance sheet. Deterministic.
// Assets and manual liabilities are entered in `company_accounts`; the debt
// schedule (`debts`) is the authoritative liability book. Equity is NEVER a
// manual authority here — the statement computes it as the plug and labels it
// computed, so the sheet always balances by construction.

export const ACCOUNT_TYPES = [
  "cash",
  "receivable",
  "other_asset",
  "liability",
  "equity",
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface AccountRow {
  id: string;
  account_name: string;
  account_type: AccountType;
  balance: number;
  as_of: string;
  notes: string | null;
}

export interface DebtForBalanceSheet {
  id: string;
  lender: string;
  balance: number;
}

export interface BalanceSheet {
  cash: number;
  receivables: number;
  otherAssets: number;
  totalAssets: number;
  scheduleDebt: number;
  manualLiabilities: number;
  totalLiabilities: number;
  computedEquity: number;
  accounts: AccountRow[];
}

export function computeBalanceSheet(
  accounts: AccountRow[],
  debts: DebtForBalanceSheet[]
): BalanceSheet {
  const sumByType = (t: AccountType) =>
    accounts
      .filter((a) => a.account_type === t)
      .reduce((s, a) => s + (Number(a.balance) || 0), 0);

  const cash = sumByType("cash");
  const receivables = sumByType("receivable");
  const otherAssets = sumByType("other_asset");
  const manualLiabilities = sumByType("liability");
  const scheduleDebt = debts.reduce((s, d) => s + (Number(d.balance) || 0), 0);

  const totalAssets = cash + receivables + otherAssets;
  const totalLiabilities = manualLiabilities + scheduleDebt;
  const computedEquity = totalAssets - totalLiabilities;

  return {
    cash,
    receivables,
    otherAssets,
    totalAssets,
    scheduleDebt,
    manualLiabilities,
    totalLiabilities,
    computedEquity,
    accounts,
  };
}
