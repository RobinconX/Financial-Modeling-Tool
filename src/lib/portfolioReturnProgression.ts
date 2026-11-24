import type { PortfolioExternalCashFlow, PortfolioTrade, SavedPortfolio, SavedScenario } from '../types'
import type { PriceHistoryPoint } from './priceHistory'
import { isOccSymbol, parseOccSymbol } from './optionContract'
import type { PerfDisplayContext } from './portfolioTradeFx'
import { externalCfByDate } from './portfolioExternalCash'
import { stepDerivedCashBalance } from './portfolioDerivedCash'
import { tradeDayNetCashFlow } from './portfolioReturnMetrics'
import {
  computePortfolioPerformance,
  todayIsoDate,
  type PortfolioPerformanceSummary,
} from './portfolioTrades'
import type {
  ReturnProgressionPoint,
  ReturnProgressionResult,
  ReturnProgressionTwrMethod,
  TwrResult,
} from './portfolioPerformanceStats'
import { isCarriedHistoryStale } from './portfolioPerformanceStats'
import { tradeUnderlying, withAutoExpireTrades } from './portfolioTradeLedger'

const TWR_NAV_DENOM_FLOOR = 1e-4

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

function staleCarriedHistorySymbols(
  summary: PortfolioPerformanceSummary,
  markDate: string,
  liveDay: string,
): string[] {
  if (markDate >= liveDay) return []
  const stale = new Set<string>()
  for (const s of summary.symbols) {
    if (s.ledgerShares === 0) continue
    if (s.markSource !== 'history' || !s.markAsOfDate) continue
    if (!isCarriedHistoryStale(s.markAsOfDate, markDate)) continue
    if (isOccSymbol(s.symbol)) {
      const u =
        s.underlying ?? parseOccSymbol(s.symbol)?.underlying
      if (u) stale.add(u)
      else stale.add(s.symbol)
    } else {
      stale.add(s.symbol)
    }
  }
  return [...stale].sort((a, b) => a.localeCompare(b))
}

/**
 * Positions-only NAV: sum of open ledger market values (equities + options).
 * Does not include Cash-tab cash or derived settlement cash.
 */
export function portfolioPositionsValueOnDate(
  trades: PortfolioTrade[],
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  historiesBySymbol: Record<string, PriceHistoryPoint[]>,
  markDate: string,
  perfCtx: PerfDisplayContext,
  tradeThroughDate: string = markDate,
  liveDay: string = todayIsoDate(),
): { value: number | null; missingSymbols: string[]; staleHistorySymbols: string[] } {
  const slice = tradesThroughDate(trades, tradeThroughDate)
  if (slice.length === 0) return { value: 0, missingSymbols: [], staleHistorySymbols: [] }

  const summary = computePortfolioPerformance(
    slice,
    portfolio,
    scenarios,
    historiesBySymbol,
    markDate,
    perfCtx,
    'progression',
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
  const staleHistorySymbols = staleCarriedHistorySymbols(summary, markDate, liveDay)
  if (missing.size > 0) {
    return { value: null, missingSymbols: [...missing].sort(), staleHistorySymbols }
  }
  let nav = 0
  for (const s of summary.symbols) {
    if (s.marketValue != null && Number.isFinite(s.marketValue)) {
      nav += s.marketValue
    }
  }
  return { value: nav, missingSymbols: [], staleHistorySymbols }
}

export type BuildFullReturnProgressionInput = {
  trades: PortfolioTrade[]
  portfolio: SavedPortfolio
  scenarios: SavedScenario[]
  historiesBySymbol: Record<string, PriceHistoryPoint[]>
  asOfDate?: string
  perfCtx?: PerfDisplayContext
  currentYear?: number
  /** Wire in/out rows for this book (not Cash-tab deposits). */
  externalFlows?: readonly PortfolioExternalCashFlow[]
}

function emptyResult(twrMethod: ReturnProgressionTwrMethod): ReturnProgressionResult {
  return {
    points: [],
    missingHistorySymbols: [],
    staleHistorySymbols: [],
    twrMethod,
  }
}

function twrDenom(base: number, flow: number): number {
  const d = base + flow
  if (!Number.isFinite(d)) return TWR_NAV_DENOM_FLOOR
  return Math.abs(d) >= TWR_NAV_DENOM_FLOOR ? d : Math.sign(d || 1) * TWR_NAV_DENOM_FLOOR
}

/**
 * Daily TWR on full NAV (positions + derived cash) when external flows exist;
 * otherwise IBKR-style trade-day neutralization on positions-only NAV.
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
    externalFlows = [],
  } = input

  const bookFlows = externalFlows.filter((f) => f.portfolioId === portfolio.id)
  const twrMethod: ReturnProgressionTwrMethod =
    bookFlows.length > 0 ? 'external' : 'approximate'
  const externalByDate = perfCtx ? externalCfByDate(bookFlows, perfCtx) : new Map<string, number>()

  if (trades.length === 0 || !perfCtx) {
    return emptyResult(twrMethod)
  }

  const liveDay = todayIsoDate()

  let firstTrade: string | null = null
  for (const t of trades) {
    if (t.tradeDate > asOfDate) continue
    if (!firstTrade || t.tradeDate < firstTrade) firstTrade = t.tradeDate
  }
  if (!firstTrade || firstTrade > asOfDate) {
    return emptyResult(twrMethod)
  }

  const missingHistory = new Set<string>()
  const staleHistory = new Set<string>()
  const points: ReturnProgressionPoint[] = []
  let linked = 1
  let prevNav: number | null = null
  let prevFullNav: number | null = null
  let derivedCash = 0
  let runningNetInvested = 0

  let date = firstTrade
  while (date <= asOfDate) {
    const expanded = withAutoExpireTrades(trades, date)
    const slice = expanded.filter((t) => t.tradeDate <= date)
    if (!slice.some((t) => t.tradeDate <= date)) {
      date = addUtcDays(date, 1)
      continue
    }

    const dayTrades = expanded.filter((t) => t.tradeDate === date)
    const hasTradeToday = dayTrades.length > 0
    const dayFlow = tradeDayNetCashFlow(dayTrades, perfCtx)
    if (hasTradeToday) runningNetInvested += dayFlow
    const extCf = externalByDate.get(date) ?? 0
    derivedCash = stepDerivedCashBalance(derivedCash, dayTrades, extCf, perfCtx)

    const { value: navEod, missingSymbols, staleHistorySymbols } =
      portfolioPositionsValueOnDate(
        trades,
        portfolio,
        scenarios,
        historiesBySymbol,
        date,
        perfCtx,
        date,
        liveDay,
      )
    for (const m of missingSymbols) missingHistory.add(m)
    for (const s of staleHistorySymbols) staleHistory.add(s)

    const fullNavEod =
      navEod != null && Number.isFinite(derivedCash) ? navEod + derivedCash : null

    let twrPct: number | null = null
    if (twrMethod === 'external') {
      if (fullNavEod != null) {
        if (prevFullNav != null) {
          const denom = twrDenom(prevFullNav, extCf)
          const r = (fullNavEod - prevFullNav - extCf) / denom
          if (Number.isFinite(r) && Math.abs(r) < 5) linked *= 1 + r
        }
        twrPct = linked - 1
        prevFullNav = fullNavEod
        prevNav = navEod
      } else {
        twrPct = null
      }
    } else if (navEod != null) {
      if (prevNav != null) {
        const safePrev = Math.abs(prevNav) >= TWR_NAV_DENOM_FLOOR ? prevNav : TWR_NAV_DENOM_FLOOR
        if (hasTradeToday) {
          const prevDate = addUtcDays(date, -1)
          const {
            value: bmv,
            missingSymbols: bmvMissing,
            staleHistorySymbols: bmvStale,
          } = portfolioPositionsValueOnDate(
            trades,
            portfolio,
            scenarios,
            historiesBySymbol,
            date,
            perfCtx,
            prevDate,
            liveDay,
          )
          for (const m of bmvMissing) missingHistory.add(m)
          for (const s of bmvStale) staleHistory.add(s)
          if (bmv != null) {
            const bmvSafe =
              Math.abs(bmv) >= TWR_NAV_DENOM_FLOOR ? bmv : TWR_NAV_DENOM_FLOOR
            const r = (navEod - bmv - dayFlow) / bmvSafe
            if (Number.isFinite(r) && Math.abs(r) < 5) linked *= 1 + r
          }
        } else {
          const r = (navEod - safePrev) / safePrev
          if (Number.isFinite(r) && Math.abs(r) < 5) linked *= 1 + r
        }
      }
      twrPct = linked - 1
      prevNav = navEod
    } else {
      twrPct = null
    }

    points.push({
      date,
      positionsNav: navEod,
      netInvested: runningNetInvested,
      twrPct,
      totalPnl: null,
      returnPct: null,
      mwrCumPct: null,
    })

    date = addUtcDays(date, 1)
  }

  return {
    points,
    missingHistorySymbols: [...missingHistory].sort(),
    staleHistorySymbols: [...staleHistory].sort(),
    twrMethod,
  }
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