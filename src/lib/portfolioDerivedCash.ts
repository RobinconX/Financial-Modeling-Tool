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

/**
 * Legacy cumulative cash (correctness reference). Prefer incremental updates in
 * buildFullReturnProgression — this scans every event date on each call.
 */
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

/** One calendar step of derived settlement cash (external wires − trade cash). */
export function stepDerivedCashBalance(
  cash: number,
  dayTrades: readonly PortfolioTrade[],
  externalCf: number,
  perfCtx: PerfDisplayContext,
): number {
  return cash - tradeDayNetCashFlow(dayTrades, perfCtx) + externalCf
}

export type DerivedCashReconciliation = {
  /** Sum of logged wires (deposits − withdrawals), display currency. */
  totalWiresDisplay: number
  derivedCashToday: number
  minCash: number
  minCashDate: string
  negativeCashDays: number
}

function addUtcDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T12:00:00Z`)
  if (!Number.isFinite(t)) return isoDate
  const d = new Date(t + days * 86_400_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** Walk calendar days: wires ± trade settlement cash (may go negative = margin). */
export function computeDerivedCashReconciliation(
  trades: PortfolioTrade[],
  asOfDate: string,
  externalCfByDate: Map<string, number>,
  perfCtx: PerfDisplayContext,
  startDate?: string,
): DerivedCashReconciliation {
  let totalWiresDisplay = 0
  for (const v of externalCfByDate.values()) totalWiresDisplay += v

  let first = startDate
  if (!first) {
    for (const t of trades) {
      if (t.tradeDate > asOfDate) continue
      if (!first || t.tradeDate < first) first = t.tradeDate
    }
    for (const d of externalCfByDate.keys()) {
      if (d <= asOfDate && (!first || d < first)) first = d
    }
  }
  if (!first || first > asOfDate) {
    return {
      totalWiresDisplay,
      derivedCashToday: 0,
      minCash: 0,
      minCashDate: asOfDate,
      negativeCashDays: 0,
    }
  }

  let cash = 0
  let minCash = 0
  let minCashDate = first
  let negativeCashDays = 0
  let date = first
  while (date <= asOfDate) {
    const expanded = withAutoExpireTrades(trades, date)
    const dayTrades = expanded.filter((t) => t.tradeDate === date)
    const ext = externalCfByDate.get(date) ?? 0
    cash = stepDerivedCashBalance(cash, dayTrades, ext, perfCtx)
    if (cash < 0) negativeCashDays++
    if (cash < minCash) {
      minCash = cash
      minCashDate = date
    }
    date = addUtcDays(date, 1)
  }

  return {
    totalWiresDisplay,
    derivedCashToday: cash,
    minCash,
    minCashDate,
    negativeCashDays,
  }
}