import type { PortfolioTrade, SavedPortfolio, SavedScenario } from '../types'
import type { PriceHistoryPoint } from './priceHistory'
import { cashTabBalanceDisplayAsOf } from './portfolioCashTab'
import { isOccSymbol, parseOccSymbol } from './optionContract'
import type { PerfDisplayContext } from './portfolioTradeFx'
import {
  computeCapitalContributionStats,
  computePortfolioTerminalNav,
} from './portfolioReturnMetrics'
import {
  computePortfolioPerformance,
  todayIsoDate,
} from './portfolioTrades'
import type {
  ReturnProgressionPoint,
  ReturnProgressionResult,
  TwrResult,
} from './portfolioPerformanceStats'
import { tradeUnderlying, withAutoExpireTrades } from './portfolioTradeLedger'

function addUtcDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T12:00:00Z`)
  if (!Number.isFinite(t)) return isoDate
  const d = new Date(t + days * 86_400_000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function tradesThroughDate(
  trades: PortfolioTrade[],
  asOfDate: string,
): PortfolioTrade[] {
  return withAutoExpireTrades(trades, asOfDate).filter((t) => t.tradeDate <= asOfDate)
}

export function portfolioNavOnDate(
  trades: PortfolioTrade[],
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  historiesBySymbol: Record<string, PriceHistoryPoint[]>,
  date: string,
  perfCtx: PerfDisplayContext,
  currentYear: number,
): { nav: number | null; missingSymbols: string[] } {
  const slice = tradesThroughDate(trades, date)
  if (slice.length === 0) return { nav: 0, missingSymbols: [] }

  const summary = computePortfolioPerformance(
    slice,
    portfolio,
    scenarios,
    historiesBySymbol,
    date,
    perfCtx,
  )
  const missing = new Set<string>()
  for (const s of summary.symbols) {
    if (s.ledgerShares === 0) continue
    if (s.markPrice == null || !Number.isFinite(s.markPrice)) {
      if (isOccSymbol(s.symbol)) {
        const u =
          s.underlying ?? parseOccSymbol(s.symbol)?.underlying ?? tradeUnderlying(
            slice.find((t) => t.symbol === s.symbol)!,
          )
        if (u) missing.add(u)
        else missing.add(s.symbol)
      } else {
        missing.add(s.symbol)
      }
    }
  }
  if (missing.size > 0) {
    return { nav: null, missingSymbols: [...missing].sort() }
  }
  const cash = cashTabBalanceDisplayAsOf(
    portfolio,
    scenarios,
    date,
    perfCtx.displayCurrency,
    perfCtx.usdToChf,
    currentYear,
  ).amount
  return {
    nav: computePortfolioTerminalNav(summary, cash),
    missingSymbols: [],
  }
}

export type BuildFullReturnProgressionInput = {
  trades: PortfolioTrade[]
  portfolio: SavedPortfolio
  scenarios: SavedScenario[]
  historiesBySymbol: Record<string, PriceHistoryPoint[]>
  asOfDate?: string
  perfCtx?: PerfDisplayContext
  currentYear?: number
}

/**
 * Daily return progression: total P&L, gross-buys %, cumulative linked TWR, and
 * cumulative non-annualized money-weighted return (gain ÷ peak net invested).
 */
export function buildFullReturnProgression(
  input: BuildFullReturnProgressionInput,
): ReturnProgressionResult {
  const {
    trades,
    portfolio,
    scenarios,
    historiesBySymbol,
    asOfDate = todayIsoDate(),
    perfCtx,
    currentYear = new Date().getFullYear(),
  } = input

  if (trades.length === 0 || !perfCtx) {
    return { points: [], missingHistorySymbols: [] }
  }

  let firstTrade: string | null = null
  for (const t of trades) {
    if (t.tradeDate > asOfDate) continue
    if (!firstTrade || t.tradeDate < firstTrade) firstTrade = t.tradeDate
  }
  if (!firstTrade || firstTrade > asOfDate) {
    return { points: [], missingHistorySymbols: [] }
  }

  const missingHistory = new Set<string>()
  const points: ReturnProgressionPoint[] = []
  let linked = 1
  let prevNav: number | null = null

  let date = firstTrade
  while (date <= asOfDate) {
    const slice = tradesThroughDate(trades, date)
  const hadActivity = slice.some((t) => t.tradeDate <= date)
    if (!hadActivity) {
      date = addUtcDays(date, 1)
      continue
    }

    const { nav, missingSymbols } = portfolioNavOnDate(
      trades,
      portfolio,
      scenarios,
      historiesBySymbol,
      date,
      perfCtx,
      currentYear,
    )
    for (const m of missingSymbols) missingHistory.add(m)

    const summary = computePortfolioPerformance(
      slice,
      portfolio,
      scenarios,
      historiesBySymbol,
      date,
      perfCtx,
    )
    const capital = computeCapitalContributionStats(slice, date, perfCtx)

    let twrPct: number | null = null
    if (nav != null) {
      if (prevNav != null && prevNav > 0) {
        linked *= nav / prevNav
      }
      twrPct = linked - 1
      prevNav = nav
    } else {
      twrPct = null
    }

    let mwrCumPct: number | null = null
    if (nav != null && capital.peakNet > 0) {
      const gain = nav - capital.currentNet
      mwrCumPct = gain / capital.peakNet
    }

    const returnPct = nav != null ? summary.returnPct : null

    points.push({
      date,
      totalPnl: nav != null ? summary.totalPnl : null,
      returnPct,
      twrPct,
      mwrCumPct,
    })

    date = addUtcDays(date, 1)
  }

  return { points, missingHistorySymbols: [...missingHistory].sort() }
}

export function computeBookTimeWeightedReturn(
  input: BuildFullReturnProgressionInput,
): TwrResult {
  const prog = buildFullReturnProgression(input)
  if (prog.points.length === 0) {
    return { twr: null, status: 'na', reason: 'No trades' }
  }
  const last = prog.points[prog.points.length - 1]!
  if (last.twrPct == null) {
    const reason =
      prog.missingHistorySymbols.length > 0
        ? `missing history for ${prog.missingHistorySymbols.slice(0, 3).join(', ')}`
        : 'missing marks'
    return { twr: null, status: 'unavailable', reason }
  }
  return { twr: last.twrPct, status: 'ok' }
}