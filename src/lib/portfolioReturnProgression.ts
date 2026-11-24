import type { PortfolioExternalCashFlow, PortfolioTrade, SavedPortfolio, SavedScenario } from '../types'
import type { PriceHistoryPoint } from './priceHistory'
import { isOccSymbol, parseOccSymbol } from './optionContract'
import type { PerfDisplayContext } from './portfolioTradeFx'
import { externalCfByDate } from './portfolioExternalCash'
import { stepDerivedCashWithImplied } from './portfolioDerivedCash'
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
  TwrImpliedCashTopUp,
  TwrResult,
} from './portfolioPerformanceStats'
import { isCarriedHistoryStale } from './portfolioPerformanceStats'
import { tradeInstrument, tradeUnderlying, withAutoExpireTrades } from './portfolioTradeLedger'

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

function portfolioPositionsNavForSlice(
  slice: PortfolioTrade[],
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  historiesBySymbol: Record<string, PriceHistoryPoint[]>,
  markDate: string,
  perfCtx: PerfDisplayContext,
  tradeThroughDate: string = markDate,
  liveDay: string = todayIsoDate(),
): { value: number | null; missingSymbols: string[]; staleHistorySymbols: string[] } {
  if (slice.length === 0) return { value: 0, missingSymbols: [], staleHistorySymbols: [] }

  const active = slice.filter((t) => t.tradeDate <= tradeThroughDate)
  if (active.length === 0) return { value: 0, missingSymbols: [], staleHistorySymbols: [] }

  const summary = computePortfolioPerformance(
    active,
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
          s.underlying ??
          parseOccSymbol(s.symbol)?.underlying ??
          tradeUnderlying(active.find((t) => t.symbol === s.symbol)!)
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
  return portfolioPositionsNavForSlice(
    slice,
    portfolio,
    scenarios,
    historiesBySymbol,
    markDate,
    perfCtx,
    tradeThroughDate,
    liveDay,
  )
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
    impliedCashTopUps: [],
  }
}

function canLinkExternalTwr(
  prevFullNav: number,
  fullNavEod: number,
  denom: number,
): boolean {
  if (!Number.isFinite(prevFullNav) || !Number.isFinite(fullNavEod)) return false
  if (prevFullNav <= TWR_NAV_DENOM_FLOOR || fullNavEod <= TWR_NAV_DENOM_FLOOR) {
    return false
  }
  if (!Number.isFinite(denom) || denom <= TWR_NAV_DENOM_FLOOR) return false
  return true
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
  const hasOptions = trades.some((t) => tradeInstrument(t) === 'option')
  const sortedEquityTrades = hasOptions
    ? []
    : [...trades]
        .filter((t) => t.tradeDate <= asOfDate)
        .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id.localeCompare(b.id))
  let equityTradeIdx = 0
  const sliceAccum: PortfolioTrade[] = []

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
  const impliedCashTopUps: TwrImpliedCashTopUp[] = []
  let date = firstTrade
  while (date <= asOfDate) {
    let slice: PortfolioTrade[]
    let dayTrades: PortfolioTrade[]
    let sliceBeforeDay: PortfolioTrade[]

    if (hasOptions) {
      const expanded = withAutoExpireTrades(trades, date)
      sliceBeforeDay = expanded.filter((t) => t.tradeDate < date)
      dayTrades = expanded.filter((t) => t.tradeDate === date)
      slice = expanded.filter((t) => t.tradeDate <= date)
    } else {
      sliceBeforeDay = sliceAccum
      dayTrades = []
      while (
        equityTradeIdx < sortedEquityTrades.length &&
        sortedEquityTrades[equityTradeIdx]!.tradeDate === date
      ) {
        const t = sortedEquityTrades[equityTradeIdx]!
        sliceAccum.push(t)
        dayTrades.push(t)
        equityTradeIdx++
      }
      slice = sliceAccum
    }

    if (slice.length === 0) {
      date = addUtcDays(date, 1)
      continue
    }

    const hasTradeToday = dayTrades.length > 0
    const dayFlow = tradeDayNetCashFlow(dayTrades, perfCtx)
    if (hasTradeToday) runningNetInvested += dayFlow
    const extCf = externalByDate.get(date) ?? 0
    const cashStep = stepDerivedCashWithImplied(derivedCash, dayTrades, extCf, perfCtx)
    derivedCash = cashStep.cash
    const totalExtCf = extCf + cashStep.impliedCf
    if (cashStep.impliedCf > 0) {
      impliedCashTopUps.push({ date, amount: cashStep.impliedCf })
    }

    const { value: navEod, missingSymbols, staleHistorySymbols } =
      portfolioPositionsNavForSlice(
        slice,
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
          const denom = prevFullNav + totalExtCf
          if (canLinkExternalTwr(prevFullNav, fullNavEod, denom)) {
            const r = (fullNavEod - prevFullNav - totalExtCf) / denom
            if (Number.isFinite(r) && r > -0.9999 && Math.abs(r) < 5) {
              linked *= 1 + r
            }
          }
        }
        twrPct = linked - 1
        if (fullNavEod > TWR_NAV_DENOM_FLOOR) prevFullNav = fullNavEod
        prevNav = navEod
      } else {
        twrPct = null
      }
    } else if (navEod != null) {
      if (prevNav != null) {
        const safePrev = Math.abs(prevNav) >= TWR_NAV_DENOM_FLOOR ? prevNav : TWR_NAV_DENOM_FLOOR
        if (hasTradeToday) {
          const { value: bmv, missingSymbols: bmvMissing, staleHistorySymbols: bmvStale } =
            portfolioPositionsNavForSlice(
              sliceBeforeDay,
              portfolio,
              scenarios,
              historiesBySymbol,
              date,
              perfCtx,
              addUtcDays(date, -1),
              liveDay,
            )
          for (const m of bmvMissing) missingHistory.add(m)
          for (const s of bmvStale) staleHistory.add(s)
          if (bmv != null && bmv > TWR_NAV_DENOM_FLOOR) {
            const r = (navEod - bmv - dayFlow) / bmv
            if (Number.isFinite(r) && r > -0.9999 && Math.abs(r) < 5) linked *= 1 + r
          }
        } else if (navEod > TWR_NAV_DENOM_FLOOR) {
          const r = (navEod - safePrev) / safePrev
          if (Number.isFinite(r) && r > -0.9999 && Math.abs(r) < 5) linked *= 1 + r
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
    impliedCashTopUps,
  }
}

export function twrResultFromProgression(prog: ReturnProgressionResult): TwrResult {
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

export function computeBookTimeWeightedReturn(
  input: BuildFullReturnProgressionInput,
): TwrResult {
  return twrResultFromProgression(buildFullReturnProgression(input))
}