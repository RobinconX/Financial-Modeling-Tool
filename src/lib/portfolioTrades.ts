import type {
  PortfolioTrade,
  PortfolioTradeSide,
  PortfolioTradesState,
  SavedPortfolio,
  SavedScenario,
} from '../types'
import { resolveCurrentPrice } from './portfolio'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** Conservative equity ticker (no options / OCC symbols). */
const EQUITY_SYMBOL = /^[A-Z][A-Z0-9.-]{0,11}$/

export function emptyPortfolioTrades(): PortfolioTradesState {
  return { version: 1, trades: [] }
}

export function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function normalizeSide(raw: unknown): PortfolioTradeSide | null {
  return raw === 'buy' || raw === 'sell' ? raw : null
}

function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const sym = raw.trim().toUpperCase()
  if (!sym || !EQUITY_SYMBOL.test(sym)) return null
  return sym
}

function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!ISO_DATE.test(s)) return null
  const [ys, ms, ds] = s.split('-')
  const y = Number(ys)
  const m = Number(ms)
  const d = Number(ds)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return s
}

/** Drop invalid rows; mint ids; uppercase symbols. Safe for agent-written JSON. */
export function normalizePortfolioTrade(raw: unknown): PortfolioTrade | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  const portfolioId = typeof o.portfolioId === 'string' ? o.portfolioId.trim() : ''
  if (!portfolioId) return null
  const symbol = normalizeSymbol(o.symbol)
  if (!symbol) return null
  const side = normalizeSide(o.side)
  if (!side) return null
  const tradeDate = normalizeDate(o.tradeDate)
  if (!tradeDate) return null
  const shares = Number(o.shares)
  if (!Number.isFinite(shares) || shares <= 0) return null
  const price = Number(o.price)
  if (!Number.isFinite(price) || price <= 0) return null
  let fees = 0
  if (o.fees != null && o.fees !== '') {
    const f = Number(o.fees)
    if (!Number.isFinite(f) || f < 0) return null
    fees = f
  }
  const id =
    typeof o.id === 'string' && o.id.trim() ? o.id.trim() : crypto.randomUUID()
  const note = typeof o.note === 'string' ? o.note.trim() || undefined : undefined
  const holdingId =
    typeof o.holdingId === 'string' && o.holdingId.trim()
      ? o.holdingId.trim()
      : undefined
  return {
    id,
    portfolioId,
    symbol,
    side,
    tradeDate,
    shares,
    price,
    fees,
    note,
    holdingId,
  }
}

export function normalizePortfolioTrades(raw: unknown): PortfolioTradesState {
  if (typeof raw !== 'object' || raw === null) return emptyPortfolioTrades()
  const o = raw as Record<string, unknown>
  if (!Array.isArray(o.trades)) return emptyPortfolioTrades()
  const trades: PortfolioTrade[] = []
  for (const row of o.trades) {
    const t = normalizePortfolioTrade(row)
    if (t) trades.push(t)
  }
  trades.sort(
    (a, b) =>
      a.tradeDate.localeCompare(b.tradeDate) ||
      a.symbol.localeCompare(b.symbol) ||
      a.id.localeCompare(b.id),
  )
  return { version: 1, trades }
}

export function newPortfolioTrade(
  portfolioId: string,
  partial?: Partial<
    Pick<PortfolioTrade, 'symbol' | 'side' | 'tradeDate' | 'holdingId'>
  >,
): PortfolioTrade {
  return {
    id: crypto.randomUUID(),
    portfolioId,
    symbol: partial?.symbol?.trim().toUpperCase() ?? '',
    side: partial?.side ?? 'buy',
    tradeDate: partial?.tradeDate ?? todayIsoDate(),
    shares: 0,
    price: 0,
    fees: 0,
    holdingId: partial?.holdingId,
  }
}

export function tradesForPortfolio(
  state: PortfolioTradesState,
  portfolioId: string,
): PortfolioTrade[] {
  return state.trades.filter((t) => t.portfolioId === portfolioId)
}

export function upsertTrade(
  state: PortfolioTradesState,
  trade: PortfolioTrade,
): PortfolioTradesState {
  const normalized = normalizePortfolioTrade(trade)
  if (!normalized) return state
  const rest = state.trades.filter((t) => t.id !== normalized.id)
  const trades = [...rest, normalized].sort(
    (a, b) =>
      a.tradeDate.localeCompare(b.tradeDate) ||
      a.symbol.localeCompare(b.symbol) ||
      a.id.localeCompare(b.id),
  )
  return { version: 1, trades }
}

export function removeTrade(
  state: PortfolioTradesState,
  tradeId: string,
): PortfolioTradesState {
  return {
    version: 1,
    trades: state.trades.filter((t) => t.id !== tradeId),
  }
}

export type SymbolPerformance = {
  symbol: string
  tradeCount: number
  ledgerShares: number
  costBasis: number
  markPrice: number | null
  marketValue: number | null
  unrealizedPnl: number | null
  realizedPnl: number
  grossBuys: number
  totalPnl: number | null
  returnPct: number | null
}

export function markPriceForSymbol(
  symbol: string,
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
): number | null {
  const sym = symbol.toUpperCase()
  const holding = portfolio.holdings.find(
    (h) => !h.option && h.symbol.toUpperCase() === sym,
  )
  if (holding) {
    const scenario =
      (holding.scenarioId
        ? scenarios.find((s) => s.id === holding.scenarioId)
        : null) ?? scenarios.find((s) => s.symbol.toUpperCase() === sym) ?? null
    const p = resolveCurrentPrice(holding, scenario)
    if (p != null && p > 0) return p
  }
  const scenario = scenarios.find((s) => s.symbol.toUpperCase() === sym)
  if (scenario?.currentPrice != null && scenario.currentPrice > 0) {
    return scenario.currentPrice
  }
  return null
}

/** Average-cost ledger per symbol from executed trades. */
export function computeSymbolPerformance(
  trades: PortfolioTrade[],
  markPrice: number | null,
): SymbolPerformance | null {
  if (trades.length === 0) return null
  const symbol = trades[0]!.symbol
  let ledgerShares = 0
  let costBasis = 0
  let realizedPnl = 0
  let grossBuys = 0

  const ordered = [...trades].sort((a, b) => a.tradeDate.localeCompare(b.tradeDate))

  for (const t of ordered) {
    if (t.side === 'buy') {
      const notional = t.shares * t.price + (t.fees ?? 0)
      grossBuys += notional
      ledgerShares += t.shares
      costBasis += notional
    } else {
      const sellShares = Math.min(t.shares, ledgerShares)
      if (sellShares <= 0) continue
      const avg = ledgerShares > 0 ? costBasis / ledgerShares : 0
      const proceeds = sellShares * t.price - (t.fees ?? 0)
      const costRemoved = avg * sellShares
      realizedPnl += proceeds - costRemoved
      ledgerShares -= sellShares
      costBasis -= costRemoved
    }
  }

  const marketValue =
    markPrice != null && ledgerShares > 0 ? ledgerShares * markPrice : null
  const unrealizedPnl =
    marketValue != null && ledgerShares > 0 ? marketValue - costBasis : ledgerShares > 0 ? null : 0

  const totalPnl =
    unrealizedPnl != null ? realizedPnl + unrealizedPnl : realizedPnl || null
  const returnPct =
    grossBuys > 0 && totalPnl != null ? totalPnl / grossBuys : null

  return {
    symbol,
    tradeCount: trades.length,
    ledgerShares,
    costBasis,
    markPrice,
    marketValue,
    unrealizedPnl,
    realizedPnl,
    grossBuys,
    totalPnl,
    returnPct,
  }
}

export type PortfolioPerformanceSummary = {
  realizedPnl: number
  unrealizedPnl: number
  totalPnl: number
  grossBuys: number
  returnPct: number | null
  symbols: SymbolPerformance[]
}

export function computePortfolioPerformance(
  trades: PortfolioTrade[],
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
): PortfolioPerformanceSummary {
  const bySymbol = new Map<string, PortfolioTrade[]>()
  for (const t of trades) {
    const list = bySymbol.get(t.symbol) ?? []
    list.push(t)
    bySymbol.set(t.symbol, list)
  }
  const symbols: SymbolPerformance[] = []
  for (const [sym, list] of bySymbol) {
    const mark = markPriceForSymbol(sym, portfolio, scenarios)
    const perf = computeSymbolPerformance(list, mark)
    if (perf) symbols.push(perf)
  }
  symbols.sort((a, b) => a.symbol.localeCompare(b.symbol))

  let realizedPnl = 0
  let unrealizedPnl = 0
  let grossBuys = 0
  for (const s of symbols) {
    realizedPnl += s.realizedPnl
    unrealizedPnl += s.unrealizedPnl ?? 0
    grossBuys += s.grossBuys
  }
  const totalPnl = realizedPnl + unrealizedPnl
  const returnPct = grossBuys > 0 ? totalPnl / grossBuys : null
  return { realizedPnl, unrealizedPnl, totalPnl, grossBuys, returnPct, symbols }
}