import type { PortfolioTrade, SavedPortfolio, SavedScenario } from '../types'
import { isOccSymbol, parseOccSymbol } from './optionContract'
import type { PerfDisplayContext } from './portfolioTradeFx'
import {
  computeSymbolPerformance,
  resolveSymbolMark,
  todayIsoDate,
  type SymbolPerformance,
} from './portfolioTrades'
import {
  tradeEvent,
  tradeInstrument,
  tradeMultiplier,
  tradeUnderlying,
} from './portfolioTradeLedger'
import { convertAmountToDisplay } from './portfolioTradeFx'
import type { PriceHistoryPoint } from './priceHistory'

export type OptionsUnderlyingRow = {
  underlying: string
  realizedPnl: number
  unrealizedPnl: number
  totalPnl: number
  premiumPaid: number
  premiumReceived: number
  openContracts: number
  closedSeries: number
  winCount: number
}

export type OptionsPerformanceAggregate = {
  realizedPnl: number
  unrealizedPnl: number
  totalPnl: number
  premiumPaid: number
  premiumReceived: number
  openContracts: number
  closedSeries: number
  winRate: number | null
  tradeCount: number
  byUnderlying: OptionsUnderlyingRow[]
}

function isOptionTrade(t: PortfolioTrade): boolean {
  return tradeInstrument(t) === 'option'
}

function optionPremiumPaid(
  trades: PortfolioTrade[],
  perfCtx?: PerfDisplayContext,
): number {
  const display = perfCtx?.displayCurrency ?? 'USD'
  const usdToChf = perfCtx?.usdToChf ?? null
  let paid = 0
  for (const t of trades) {
    const ev = tradeEvent(t)
    if (ev === 'expire' || ev === 'assign' || ev === 'exercise') continue
    if (t.side !== 'buy') continue
    const mult = tradeMultiplier(t)
    const px = convertAmountToDisplay(t.price, t.currency ?? 'USD', display, usdToChf)
    const fees = t.fees ?? 0
    const feeCur = t.feesCurrency ?? t.currency ?? 'USD'
    const feesDisp =
      fees > 0 ? convertAmountToDisplay(fees, feeCur, display, usdToChf) : 0
    paid += t.shares * px * mult + feesDisp
  }
  return paid
}

export function tradedEquitySymbolsFromTrades(trades: PortfolioTrade[]): string[] {
  const set = new Set<string>()
  for (const t of trades) {
    if (!isOptionTrade(t)) set.add(t.symbol)
  }
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** Equity underlyings for daily price-history fetch (never OCC contract symbols). */
export function equityHistorySymbolsFromTrades(
  trades: PortfolioTrade[],
  scopeSymbol?: string | null,
): string[] {
  const syms = new Set<string>(tradedEquitySymbolsFromTrades(trades))
  const scope = scopeSymbol?.trim().toUpperCase()
  if (scope && !isOccSymbol(scope)) syms.add(scope)
  for (const t of trades) {
    if (!isOptionTrade(t)) continue
    const u = tradeUnderlying(t)
    if (u && !isOccSymbol(u)) syms.add(u)
  }
  return [...syms].sort((a, b) => a.localeCompare(b))
}

export function equityTradesMatchingScope(
  trades: PortfolioTrade[],
  scopeSymbol: string | null,
): PortfolioTrade[] {
  if (!scopeSymbol) {
    return trades.filter((t) => !isOptionTrade(t))
  }
  const sym = scopeSymbol.toUpperCase()
  return trades.filter((t) => !isOptionTrade(t) && t.symbol === sym)
}

export function tradesMatchingPerformanceScope(
  trades: PortfolioTrade[],
  scopeSymbol: string | null,
): PortfolioTrade[] {
  if (!scopeSymbol) return trades
  const sym = scopeSymbol.toUpperCase()
  return trades.filter((t) => !isOptionTrade(t) && t.symbol === sym)
}

export function optionTradesForReturnMarkers(
  trades: PortfolioTrade[],
  scopeSymbol: string | null,
): PortfolioTrade[] {
  const opts = trades.filter(isOptionTrade)
  if (!scopeSymbol) return opts
  const sym = scopeSymbol.toUpperCase()
  return opts.filter((t) => (tradeUnderlying(t) ?? '').toUpperCase() === sym)
}

export function computeOptionsPerformanceAggregate(
  trades: PortfolioTrade[],
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  historiesBySymbol: Record<string, PriceHistoryPoint[]> = {},
  asOfDate: string = todayIsoDate(),
  perfCtx?: PerfDisplayContext,
): OptionsPerformanceAggregate | null {
  const options = trades.filter(isOptionTrade)
  if (options.length === 0) return null

  const byOcc = new Map<string, PortfolioTrade[]>()
  for (const t of options) {
    const list = byOcc.get(t.symbol) ?? []
    list.push(t)
    byOcc.set(t.symbol, list)
  }

  const occPerfs: SymbolPerformance[] = []
  for (const [occ, list] of byOcc) {
    const histCur = perfCtx?.quoteCurrencyBySymbol[occ]
    const markRaw = resolveSymbolMark(
      occ,
      portfolio,
      scenarios,
      [],
      asOfDate,
      histCur === 'CHF' ? 'CHF' : histCur === 'USD' ? 'USD' : undefined,
      historiesBySymbol,
      perfCtx?.quoteCurrencyBySymbol,
    )
    const perf = computeSymbolPerformance(list, markRaw, asOfDate, perfCtx)
    if (perf) occPerfs.push(perf)
  }

  const byUnd = new Map<string, SymbolPerformance[]>()
  for (const p of occPerfs) {
    const u =
      p.underlying ?? parseOccSymbol(p.symbol)?.underlying ?? p.symbol
    const list = byUnd.get(u) ?? []
    list.push(p)
    byUnd.set(u, list)
  }

  const byUnderlying: OptionsUnderlyingRow[] = []
  let realizedPnl = 0
  let unrealizedPnl = 0
  let premiumPaid = 0
  let premiumReceived = 0
  let openContracts = 0
  let closedSeries = 0
  let winCount = 0

  for (const [underlying, perfs] of [...byUnd.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    let uReal = 0
    let uUnreal = 0
    let uPaid = 0
    let uRecv = 0
    let uOpen = 0
    let uClosed = 0
    let uWins = 0
    for (const p of perfs) {
      const occTrades = byOcc.get(p.symbol) ?? []
      uReal += p.realizedPnl
      uUnreal += p.unrealizedPnl ?? 0
      uPaid += optionPremiumPaid(occTrades, perfCtx)
      uRecv += p.grossPremiumReceived
      if (p.ledgerShares !== 0) {
        uOpen += Math.abs(p.ledgerShares)
      } else {
        uClosed += 1
        const total = p.totalPnl ?? p.realizedPnl
        if (total > 0) uWins += 1
      }
    }
    byUnderlying.push({
      underlying,
      realizedPnl: uReal,
      unrealizedPnl: uUnreal,
      totalPnl: uReal + uUnreal,
      premiumPaid: uPaid,
      premiumReceived: uRecv,
      openContracts: uOpen,
      closedSeries: uClosed,
      winCount: uWins,
    })
    realizedPnl += uReal
    unrealizedPnl += uUnreal
    premiumPaid += uPaid
    premiumReceived += uRecv
    openContracts += uOpen
    closedSeries += uClosed
    winCount += uWins
  }

  const winRate = closedSeries > 0 ? winCount / closedSeries : null

  return {
    realizedPnl,
    unrealizedPnl,
    totalPnl: realizedPnl + unrealizedPnl,
    premiumPaid,
    premiumReceived,
    openContracts,
    closedSeries,
    winRate,
    tradeCount: options.length,
    byUnderlying,
  }
}