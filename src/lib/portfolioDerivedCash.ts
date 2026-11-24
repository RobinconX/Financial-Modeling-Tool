import type { PortfolioTrade } from '../types'
import { tradeDayNetCashFlow } from './portfolioReturnMetrics'
import { withAutoExpireTrades } from './portfolioTradeLedger'
import type { PerfDisplayContext } from './portfolioTradeFx'

function tradesOnDay(
  trades: PortfolioTrade[],
  asOfDate: string,
  day: string,
): PortfolioTrade[] {
  return withAutoExpireTrades(trades, asOfDate).filter((t) => t.tradeDate === day)
}

/** Cumulative derived cash (external wires ± trade settlement), display currency. */
export function derivedCashBalanceThrough(
  trades: PortfolioTrade[],
  throughDate: string,
  externalCfByDate: Map<string, number>,
  perfCtx: PerfDisplayContext,
): number {
  const dates = new Set<string>()
  for (const t of withAutoExpireTrades(trades, throughDate)) {
    if (t.tradeDate <= throughDate) dates.add(t.tradeDate)
  }
  for (const d of externalCfByDate.keys()) {
    if (d <= throughDate) dates.add(d)
  }
  const sorted = [...dates].sort((a, b) => a.localeCompare(b))
  let cash = 0
  for (const d of sorted) {
    if (d > throughDate) break
    const dayTrades = tradesOnDay(trades, throughDate, d)
    cash -= tradeDayNetCashFlow(dayTrades, perfCtx)
    cash += externalCfByDate.get(d) ?? 0
  }
  return cash
}