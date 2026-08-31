export interface PortfolioDeal {
  id: string;
  stage: string;
  createdAt: string;
  stageChangedAt: string;
}

export interface PortfolioDealPnl {
  isRealized?: boolean;
  realizedProfit?: number | null;
  finalSalePrice?: number | null;
  projectedProfit?: number | null;
}

export interface PortfolioInput {
  deals: PortfolioDeal[];
  pnls: Record<string, PortfolioDealPnl>;
}

export interface PortfolioMetrics {
  pipelineValue: number;
  realizedProfit: number;
  realizedCount: number;
  averageCycleDays: number | null;
  openDealCount: number;
}

const daysBetween = (a: string, b: string) =>
  Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000));

export function computePortfolioMetrics(input: PortfolioInput): PortfolioMetrics {
  let pipelineValue = 0;
  let realizedProfit = 0;
  let realizedCount = 0;
  const cycleDays: number[] = [];

  for (const d of input.deals) {
    const pnl = input.pnls[d.id];
    if (d.stage === "Closed") {
      if (pnl?.isRealized) {
        realizedProfit += Number(pnl.realizedProfit) || 0;
        realizedCount++;
      }
      cycleDays.push(daysBetween(d.createdAt, d.stageChangedAt));
    } else {
      pipelineValue += Number(pnl?.projectedProfit) || 0;
    }
  }

  const averageCycleDays =
    cycleDays.length > 0
      ? Math.round(cycleDays.reduce((s, n) => s + n, 0) / cycleDays.length)
      : null;

  return {
    pipelineValue,
    realizedProfit,
    realizedCount,
    averageCycleDays,
    openDealCount: input.deals.filter((d) => d.stage !== "Closed").length,
  };
}