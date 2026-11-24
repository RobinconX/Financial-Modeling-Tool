import type { PortfolioTrade } from '../types'
import type { PriceHistoryPoint } from './priceHistory'
import { latestHistoryClose, todayIsoDate } from './portfolioTrades'
import {
  historyCloseInDisplay,
  tradesInDisplayCurrency,
  type PerfDisplayContext,
} from './portfolioTradeFx'
import {
  ledgerSnapshotAt,
  returnDenominator,
  tradeInstrument,
  tradeMultiplier,
  unrealizedPnlFromLedger,
  withAutoExpireTrades,
} from './portfolioTradeLedger'

export type TradeActivityStats = {
  tradeCount: number
  buyCount: number
  sellCount: number
  firstTradeDate: string | null
  lastTradeDate: string | null
  holdingPeriodDays: number | null
  status: 'open' | 'closed'
}

export type PortfolioActivityRollup = TradeActivityStats & {
  openSymbolCount: number
  closedSymbolCount: number
}

export type HoldingCostStats = {
  ledgerShares: number
  averageCost: number | null
  breakeven: number | null
  grossBuys: number
  sellProceeds: number
  buyShares: number
  sellShares: number
  pctSold: number | null
  openCostBasis: number
  currentValue: number | null
  concentration: number | null
}

export type TwrResult = {
  twr: number | null
  status: 'ok' | 'unavailable' | 'na'
  reason?: string
}

/** Beyond this gap, carried closes still mark the series but are flagged stale. */
export const MAX_HISTORY_CARRY_STALE_DAYS = 7

const MAX_CLOSE_STALE_DAYS = MAX_HISTORY_CARRY_STALE_DAYS

export function historyCarryGapDays(closeDate: string, asOfDate: string): number | null {
  return daysBetween(closeDate, asOfDate)
}

export function isCarriedHistoryStale(closeDate: string, asOfDate: string): boolean {
  const gap = historyCarryGapDays(closeDate, asOfDate)
  return gap != null && gap > MAX_HISTORY_CARRY_STALE_DAYS
}

export function closeOnOrBefore(
  points: PriceHistoryPoint[],
  date: string,
): number | null {
  let best: number | null = null
  let bestDate = ''
  for (const p of points) {
    if (p.date <= date && p.close > 0 && p.date >= bestDate) {
      bestDate = p.date
      best = p.close
    }
  }
  if (best == null) return null
  const gap = daysBetween(bestDate, date)
  if (gap != null && gap > MAX_CLOSE_STALE_DAYS) return null
  return best
}

export function computeTradeActivity(
  trades: PortfolioTrade[],
  ledgerShares: number,
  asOfDate: string = todayIsoDate(),
): TradeActivityStats {
  if (trades.length === 0) {
    return {
      tradeCount: 0,
      buyCount: 0,
      sellCount: 0,
      firstTradeDate: null,
      lastTradeDate: null,
      holdingPeriodDays: null,
      status: 'closed',
    }
  }
  const ordered = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
  let buyCount = 0
  let sellCount = 0
  for (const t of trades) {
    if (t.side === 'buy') buyCount += 1
    else sellCount += 1
  }
  const first = ordered[0]!.tradeDate
  const last = ordered[ordered.length - 1]!.tradeDate
  const status = ledgerShares > 0 ? 'open' : 'closed'
  const endDate = status === 'open' ? asOfDate : last
  const holdingPeriodDays = daysBetween(first, endDate)

  return {
    tradeCount: trades.length,
    buyCount,
    sellCount,
    firstTradeDate: first,
    lastTradeDate: last,
    holdingPeriodDays,
    status,
  }
}

export function computePortfolioActivityRollup(
  symbolsTrades: { trades: PortfolioTrade[]; ledgerShares: number }[],
): PortfolioActivityRollup {
  const allTrades = symbolsTrades.flatMap((s) => s.trades)
  let openSymbolCount = 0
  let closedSymbolCount = 0
  for (const s of symbolsTrades) {
    if (s.trades.length === 0) continue
    if (s.ledgerShares !== 0) openSymbolCount += 1
    else closedSymbolCount += 1
  }
  const sorted =
    allTrades.length > 0
      ? [...allTrades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))
      : []
  return {
    tradeCount: allTrades.length,
    buyCount: allTrades.filter((t) => t.side === 'buy').length,
    sellCount: allTrades.filter((t) => t.side === 'sell').length,
    firstTradeDate: sorted[0]?.tradeDate ?? null,
    lastTradeDate: sorted.at(-1)?.tradeDate ?? null,
    holdingPeriodDays: null,
    status: openSymbolCount > 0 ? 'open' : 'closed',
    openSymbolCount,
    closedSymbolCount,
  }
}

export function computeHoldingCostStats(
  trades: PortfolioTrade[],
  ledgerShares: number,
  costBasis: number,
  grossBuys: number,
  marketValue: number | null,
  totalOpenMarketValue: number | null,
): HoldingCostStats {
  let sellProceeds = 0
  let buyShares = 0
  let sellShares = 0
  for (const t of trades) {
    if (t.side === 'buy') {
      buyShares += t.shares
    } else {
      sellShares += t.shares
      sellProceeds += t.shares * t.price - (t.fees ?? 0)
    }
  }
  const averageCost = ledgerShares > 0 ? costBasis / ledgerShares : null
  const pctSold = buyShares > 0 ? sellShares / buyShares : null
  const concentration =
    marketValue != null &&
    marketValue > 0 &&
    totalOpenMarketValue != null &&
    totalOpenMarketValue > 0
      ? marketValue / totalOpenMarketValue
      : null

  return {
    ledgerShares,
    averageCost,
    breakeven: averageCost,
    grossBuys,
    sellProceeds,
    buyShares,
    sellShares,
    pctSold,
    openCostBasis: costBasis,
    currentValue: marketValue,
    concentration,
  }
}

function daysBetween(start: string, end: string): number | null {
  const a = Date.parse(`${start}T12:00:00Z`)
  const b = Date.parse(`${end}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.max(0, Math.round((b - a) / (24 * 60 * 60 * 1000)))
}

/**
 * Linked time-weighted return for one symbol's trade ledger.
 * Uses daily closes between cash flows; trade days use BMV/EMV/CF neutralization.
 */
export function computeTimeWeightedReturn(
  trades: PortfolioTrade[],
  points: PriceHistoryPoint[],
  asOfDate: string = todayIsoDate(),
  perfCtx?: PerfDisplayContext,
  symbol?: string,
): TwrResult {
  if (trades.length === 0) return { twr: null, status: 'na' }
  if (tradeInstrument(trades[0]!) === 'option') return { twr: null, status: 'na' }
  if (!points.length) {
    return { twr: null, status: 'unavailable', reason: 'missing price history' }
  }

  const sym = symbol ?? trades[0]?.symbol ?? ''
  const ledgerTrades = perfCtx
    ? tradesInDisplayCurrency(
        trades,
        perfCtx.displayCurrency,
        perfCtx.usdToChf,
      )
    : trades
  const closeAt = (date: string): number | null => {
    const raw = closeOnOrBefore(points, date)
    if (raw == null) return null
    if (!perfCtx || !sym) return raw
    return historyCloseInDisplay(raw, sym, perfCtx)
  }

  const ordered = [...ledgerTrades].sort(
    (a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id.localeCompare(b.id),
  )

  const byDate = new Map<string, PortfolioTrade[]>()
  for (const t of ordered) {
    const list = byDate.get(t.tradeDate) ?? []
    list.push(t)
    byDate.set(t.tradeDate, list)
  }

  let shares = 0
  let linked = 1
  const tradeDates = [...byDate.keys()].sort()
  if (tradeDates.length === 0) return { twr: null, status: 'na' }

  for (const t of ordered) {
    if (t.side === 'buy') shares += t.shares
    else shares -= Math.min(t.shares, shares)
  }
  const endShares = Math.max(0, shares)

  const terminalDate = endShares > 0 ? asOfDate : tradeDates[tradeDates.length - 1]!
  const timeline = [...tradeDates]
  if (endShares > 0 && terminalDate > tradeDates[tradeDates.length - 1]!) {
    timeline.push(terminalDate)
  }

  shares = 0
  let prevDate: string | null = null

  for (const date of timeline) {
    const dayTrades = byDate.get(date) ?? []

    if (prevDate != null && prevDate < date) {
      const c0 = closeAt(prevDate)
      const c1 = closeAt(date)
      if (c0 == null || c1 == null) {
        return { twr: null, status: 'unavailable', reason: 'missing price history' }
      }
      if (shares > 0) {
        linked *= c1 / c0
      }
    }

    if (dayTrades.length > 0) {
      const c = closeAt(date)
      if (c == null) {
        return { twr: null, status: 'unavailable', reason: 'missing price history' }
      }
      const bmv = shares * c
      let cf = 0
      for (const t of dayTrades) {
        if (t.side === 'buy') {
          cf += t.shares * t.price + (t.fees ?? 0)
          shares += t.shares
        } else {
          const s = Math.min(t.shares, shares)
          cf -= s * t.price - (t.fees ?? 0)
          shares -= s
        }
      }
      const emv = shares * c
      if (bmv > 0) {
        const r = (emv - bmv - cf) / bmv
        if (Number.isFinite(r)) linked *= 1 + r
      }
    }

    prevDate = date
  }

  if (!Number.isFinite(linked) || linked <= 0) return { twr: null, status: 'unavailable' }
  return { twr: linked - 1, status: 'ok' }
}

export function formatHoldingPeriod(days: number | null): string {
  if (days == null) return '—'
  if (days < 60) return `${days}d`
  const months = Math.round(days / 30.44)
  if (months < 24) return `${months}mo`
  const years = (days / 365.25).toFixed(1)
  return `${years}y`
}

export type LedgerSnapshot = import('./portfolioTradeLedger').LedgerSnapshot

export { ledgerSnapshotAt } from './portfolioTradeLedger'

export type ReturnProgressionPoint = {
  date: string
  /** Positions-only NAV (display currency). */
  positionsNav?: number | null
  /** Cumulative net trade capital through the day. */
  netInvested?: number | null
  totalPnl: number | null
  /** Gross-buys return (total P&L ÷ gross buys), decimal. */
  returnPct: number | null
  /** Cumulative linked TWR from inception, decimal. */
  twrPct: number | null
  /** @deprecated Chart no longer plots cumulative MWR. */
  mwrCumPct: number | null
}

export type ReturnProgressionTwrMethod = 'external' | 'approximate'

export type ReturnProgressionResult = {
  points: ReturnProgressionPoint[]
  missingHistorySymbols: string[]
  /** Symbols whose carried history close was >7 calendar days old on at least one past chart day. */
  staleHistorySymbols: string[]
  twrMethod: ReturnProgressionTwrMethod
}

function addUtcDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T12:00:00Z`)
  if (!Number.isFinite(t)) return isoDate
  const d = new Date(t + days * 86_400_000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function closeForPnlOnDate(
  points: PriceHistoryPoint[],
  date: string,
  asOfDate: string,
): number | null {
  const c = closeOnOrBefore(points, date)
  if (c != null) return c
  if (date === asOfDate) {
    return latestHistoryClose(points, date)?.price ?? null
  }
  return null
}

function symbolPnlOnDate(
  trades: PortfolioTrade[],
  points: PriceHistoryPoint[],
  date: string,
  asOfDate: string,
  perfCtx?: PerfDisplayContext,
  symbol?: string,
): { totalPnl: number | null; grossBuys: number } {
  const active = trades.some((t) => t.tradeDate <= date)
  if (!active) return { totalPnl: 0, grossBuys: 0 }
  const expanded = withAutoExpireTrades(trades, asOfDate)
  const snap = ledgerSnapshotAt(expanded, date, perfCtx)
  const denom = returnDenominator(snap)
  if (snap.shares === 0) {
    return { totalPnl: snap.realizedPnl, grossBuys: denom }
  }
  let close = closeForPnlOnDate(points, date, asOfDate)
  if (close == null) {
    return { totalPnl: null, grossBuys: denom }
  }
  if (perfCtx && symbol) {
    close = historyCloseInDisplay(close, symbol, perfCtx)
  }
  const mult = tradeMultiplier(trades[0]!)
  const marketValue = snap.shares * close * mult
  const unrealized = unrealizedPnlFromLedger(snap.shares, snap.costBasis, marketValue)
  return { totalPnl: snap.realizedPnl + unrealized, grossBuys: denom }
}

/**
 * Daily return progression for scoped trades (one or many symbols).
 * returnPct = totalPnl / cumulative gross buys; gaps when open marks need missing history.
 */
export function buildReturnProgression(
  tradesBySymbol: Map<string, PortfolioTrade[]>,
  histories: Record<string, PriceHistoryPoint[]>,
  asOfDate: string = todayIsoDate(),
  perfCtx?: PerfDisplayContext,
): ReturnProgressionResult {
  const entries = [...tradesBySymbol.entries()].filter(([, tr]) => tr.length > 0)
  if (entries.length === 0) {
    return {
      points: [],
      missingHistorySymbols: [],
      staleHistorySymbols: [],
      twrMethod: 'approximate',
    }
  }

  let firstTrade: string | null = null
  for (const [, trades] of entries) {
    const f = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))[0]!
      .tradeDate
    if (!firstTrade || f < firstTrade) firstTrade = f
  }
  if (!firstTrade || firstTrade > asOfDate) {
    return {
      points: [],
      missingHistorySymbols: [],
      staleHistorySymbols: [],
      twrMethod: 'approximate',
    }
  }

  const missingHistory = new Set<string>()
  const points: ReturnProgressionPoint[] = []

  let date = firstTrade
  while (date <= asOfDate) {
    let totalPnl: number | null = 0
    let grossBuys = 0
    let hadActivity = false

    for (const [symbol, trades] of entries) {
      if (!trades.some((t) => t.tradeDate <= date)) continue
      hadActivity = true
      const symPnl = symbolPnlOnDate(
        trades,
        histories[symbol] ?? [],
        date,
        asOfDate,
        perfCtx,
        symbol,
      )
      grossBuys += symPnl.grossBuys
      if (symPnl.totalPnl == null) {
        totalPnl = null
        const snap = ledgerSnapshotAt(
          withAutoExpireTrades(trades, asOfDate),
          date,
          perfCtx,
        )
        if (snap.shares !== 0) missingHistory.add(symbol)
      } else if (totalPnl != null) {
        totalPnl += symPnl.totalPnl
      }
    }

    if (hadActivity) {
      const returnPct =
        totalPnl != null && grossBuys > 0 ? totalPnl / grossBuys : null
      points.push({
        date,
        positionsNav: null,
        netInvested: null,
        totalPnl,
        returnPct,
        twrPct: null,
        mwrCumPct: null,
      })
    }

    date = addUtcDays(date, 1)
  }

  return {
    points,
    missingHistorySymbols: [...missingHistory].sort(),
    staleHistorySymbols: [],
    twrMethod: 'approximate',
  }
}

/** Split performance symbol rows for whole-portfolio table (open vs fully sold). */
export function partitionPerformanceSymbolsByOpen<
  T extends { ledgerShares: number },
>(symbols: readonly T[]): { open: T[]; closed: T[] } {
  const open: T[] = []
  const closed: T[] = []
  for (const s of symbols) {
    if (s.ledgerShares !== 0) open.push(s)
    else closed.push(s)
  }
  return { open, closed }
}