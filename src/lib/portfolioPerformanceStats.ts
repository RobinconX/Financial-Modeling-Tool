import type { PortfolioTrade } from '../types'
import type { PriceHistoryPoint } from './priceHistory'
import { latestHistoryClose, todayIsoDate } from './portfolioTrades'

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
}

const MAX_CLOSE_STALE_DAYS = 7

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
    if (s.ledgerShares > 0) openSymbolCount += 1
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
): TwrResult {
  if (trades.length === 0) return { twr: null, status: 'na' }
  if (!points.length) return { twr: null, status: 'unavailable' }

  const ordered = [...trades].sort(
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
      const c0 = closeOnOrBefore(points, prevDate)
      const c1 = closeOnOrBefore(points, date)
      if (c0 == null || c1 == null) return { twr: null, status: 'unavailable' }
      if (shares > 0) {
        linked *= c1 / c0
      }
    }

    if (dayTrades.length > 0) {
      const c = closeOnOrBefore(points, date)
      if (c == null) return { twr: null, status: 'unavailable' }
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

export type LedgerSnapshot = {
  shares: number
  costBasis: number
  realizedPnl: number
  grossBuys: number
}

/** Average-cost ledger after all trades with tradeDate <= asOfDate. */
export function ledgerSnapshotAt(
  trades: PortfolioTrade[],
  asOfDate: string,
): LedgerSnapshot {
  let shares = 0
  let costBasis = 0
  let realizedPnl = 0
  let grossBuys = 0
  const ordered = [...trades]
    .filter((t) => t.tradeDate <= asOfDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id.localeCompare(b.id))
  for (const t of ordered) {
    if (t.side === 'buy') {
      const notional = t.shares * t.price + (t.fees ?? 0)
      grossBuys += notional
      shares += t.shares
      costBasis += notional
    } else {
      const sellShares = Math.min(t.shares, shares)
      if (sellShares <= 0) continue
      const avg = shares > 0 ? costBasis / shares : 0
      const proceeds = sellShares * t.price - (t.fees ?? 0)
      const costRemoved = avg * sellShares
      realizedPnl += proceeds - costRemoved
      shares -= sellShares
      costBasis -= costRemoved
    }
  }
  return { shares, costBasis, realizedPnl, grossBuys }
}

export type ReturnProgressionPoint = {
  date: string
  totalPnl: number | null
  returnPct: number | null
}

export type ReturnProgressionResult = {
  points: ReturnProgressionPoint[]
  missingHistorySymbols: string[]
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
): { totalPnl: number | null; grossBuys: number } {
  const active = trades.some((t) => t.tradeDate <= date)
  if (!active) return { totalPnl: 0, grossBuys: 0 }
  const snap = ledgerSnapshotAt(trades, date)
  if (snap.shares <= 0) {
    return { totalPnl: snap.realizedPnl, grossBuys: snap.grossBuys }
  }
  const close = closeForPnlOnDate(points, date, asOfDate)
  if (close == null) {
    return { totalPnl: null, grossBuys: snap.grossBuys }
  }
  const unrealized = snap.shares * close - snap.costBasis
  return { totalPnl: snap.realizedPnl + unrealized, grossBuys: snap.grossBuys }
}

/**
 * Daily return progression for scoped trades (one or many symbols).
 * returnPct = totalPnl / cumulative gross buys; gaps when open marks need missing history.
 */
export function buildReturnProgression(
  tradesBySymbol: Map<string, PortfolioTrade[]>,
  histories: Record<string, PriceHistoryPoint[]>,
  asOfDate: string = todayIsoDate(),
): ReturnProgressionResult {
  const entries = [...tradesBySymbol.entries()].filter(([, tr]) => tr.length > 0)
  if (entries.length === 0) {
    return { points: [], missingHistorySymbols: [] }
  }

  let firstTrade: string | null = null
  for (const [, trades] of entries) {
    const f = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))[0]!
      .tradeDate
    if (!firstTrade || f < firstTrade) firstTrade = f
  }
  if (!firstTrade || firstTrade > asOfDate) {
    return { points: [], missingHistorySymbols: [] }
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
      )
      grossBuys += symPnl.grossBuys
      if (symPnl.totalPnl == null) {
        totalPnl = null
        const snap = ledgerSnapshotAt(trades, date)
        if (snap.shares > 0) missingHistory.add(symbol)
      } else if (totalPnl != null) {
        totalPnl += symPnl.totalPnl
      }
    }

    if (hadActivity) {
      const returnPct =
        totalPnl != null && grossBuys > 0 ? totalPnl / grossBuys : null
      points.push({ date, totalPnl, returnPct })
    }

    date = addUtcDays(date, 1)
  }

  return { points, missingHistorySymbols: [...missingHistory].sort() }
}