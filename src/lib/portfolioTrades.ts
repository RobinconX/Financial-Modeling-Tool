import type {
  DisplayCurrency,
  PortfolioHolding,
  PortfolioTrade,
  PortfolioTradeEvent,
  PortfolioTradeInstrument,
  PortfolioTradeSide,
  PortfolioTradesState,
  SavedPortfolio,
  SavedScenario,
} from '../types'
import {
  convertAmountToDisplay,
  quoteToDisplayCurrency,
  type PerfDisplayContext,
} from './portfolioTradeFx'
import type { PriceHistoryPoint } from './priceHistory'
import { resolveCurrentPrice } from './portfolio'
import { isOccSymbol, optionIsExpired, parseOccSymbol } from './optionContract'
import { contractFieldsFromOcc, resolveOptionSymbolFromRow } from './portfolioOptionTradeParse'
import {
  computeLedgerPerformance,
  tradeInstrument,
  withAutoExpireTrades,
} from './portfolioTradeLedger'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** Conservative equity ticker (no options / OCC symbols). */
const EQUITY_SYMBOL = /^[A-Z][A-Z0-9.-]{0,11}$/

function normalizeInstrument(raw: unknown): PortfolioTradeInstrument {
  return raw === 'option' ? 'option' : 'equity'
}

function normalizeEvent(raw: unknown): PortfolioTradeEvent {
  if (raw === 'expire' || raw === 'assign' || raw === 'exercise') return raw
  return 'trade'
}

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

function normalizeEquitySymbol(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const sym = raw.trim().toUpperCase()
  if (!sym || !EQUITY_SYMBOL.test(sym)) return null
  return sym
}

function normalizeTradeSymbol(
  o: Record<string, unknown>,
  instrument: PortfolioTradeInstrument,
): string | null {
  if (instrument === 'option') {
    const occ = resolveOptionSymbolFromRow(o)
    return occ
  }
  const symRaw = o.symbol
  if (typeof symRaw === 'string' && isOccSymbol(symRaw)) return null
  return normalizeEquitySymbol(symRaw)
}

function normalizeTradeCurrency(raw: unknown): DisplayCurrency {
  if (raw === 'CHF' || raw === 'USD') return raw
  return 'USD'
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
  let instrument = normalizeInstrument(o.instrument)
  if (o.occSymbol != null || (typeof o.description === 'string' && o.description.trim())) {
    instrument = 'option'
  }
  if (instrument !== 'option' && typeof o.symbol === 'string' && isOccSymbol(o.symbol)) {
    instrument = 'option'
  }
  const symbol = normalizeTradeSymbol(o, instrument)
  if (!symbol) return null
  const event = normalizeEvent(o.event)
  const side = normalizeSide(o.side)
  if (!side && event === 'trade') return null
  const tradeDate = normalizeDate(o.tradeDate)
  if (!tradeDate) return null
  const shares = Number(o.shares)
  if (!Number.isFinite(shares) || shares <= 0) return null
  const price = Number(o.price)
  if (!Number.isFinite(price)) return null
  if (event === 'trade' && price <= 0) return null
  if (event !== 'trade' && price < 0) return null
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
  const currency = normalizeTradeCurrency(o.currency)
  const feesCurrency =
    o.feesCurrency === 'CHF' || o.feesCurrency === 'USD'
      ? o.feesCurrency
      : currency
  const contract = instrument === 'option' ? contractFieldsFromOcc(symbol) : null
  const multiplier =
    instrument === 'option'
      ? (() => {
          const m = Number(o.multiplier)
          if (Number.isFinite(m) && m > 0) return m
          return contract?.multiplier ?? 100
        })()
      : undefined
  const linkedTradeId =
    typeof o.linkedTradeId === 'string' && o.linkedTradeId.trim()
      ? o.linkedTradeId.trim()
      : undefined
  return {
    id,
    portfolioId,
    symbol,
    side: side ?? (event === 'expire' ? 'sell' : 'buy'),
    tradeDate,
    shares,
    price,
    currency,
    fees,
    feesCurrency,
    note,
    holdingId,
    instrument,
    event,
    linkedTradeId,
    multiplier,
    underlying: contract?.underlying ?? (typeof o.underlying === 'string' ? o.underlying.trim().toUpperCase() : undefined),
    right: contract?.right ?? (o.right === 'C' || o.right === 'P' ? o.right : undefined),
    strike: contract?.strike ?? (Number.isFinite(Number(o.strike)) ? Number(o.strike) : undefined),
    expiry: contract?.expiration ?? (typeof o.expiry === 'string' ? o.expiry : undefined),
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
  const version =
    typeof o.version === 'number' && o.version === 2
      ? 2
      : trades.some((t) => t.instrument === 'option')
        ? 2
        : 1
  return { version, trades }
}

export function newPortfolioTrade(
  portfolioId: string,
  partial?: Partial<
    Pick<PortfolioTrade, 'symbol' | 'side' | 'tradeDate' | 'holdingId' | 'currency'>
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
    currency: partial?.currency ?? 'USD',
    fees: 0,
    holdingId: partial?.holdingId,
  }
}

/** Default manual-entry currency from cached quote/history metadata when known. */
export function defaultTradeCurrencyForSymbol(
  symbol: string,
  quoteCurrencyBySymbol: Record<string, DisplayCurrency> = {},
): DisplayCurrency {
  const c = quoteCurrencyBySymbol[symbol.trim().toUpperCase()]
  return c === 'CHF' ? 'CHF' : 'USD'
}

export function tradesForPortfolio(
  state: PortfolioTradesState,
  portfolioId: string,
): PortfolioTrade[] {
  return state.trades.filter((t) => t.portfolioId === portfolioId)
}

/** Every symbol with at least one trade on this book (incl. closed / symbol-only). */
export function tradedSymbolsFromTrades(trades: PortfolioTrade[]): string[] {
  const set = new Set<string>()
  for (const t of trades) set.add(t.symbol)
  return [...set].sort((a, b) => a.localeCompare(b))
}

/** `symbol` null = all trades for the book. */
export function tradesMatchingSymbol(
  trades: PortfolioTrade[],
  symbol: string | null,
): PortfolioTrade[] {
  if (!symbol) return trades
  const sym = symbol.toUpperCase()
  return trades.filter((t) => t.symbol === sym)
}

export function upsertTrade(
  state: PortfolioTradesState,
  trade: PortfolioTrade,
  linkContext?: {
    portfolio: SavedPortfolio
    scenarios?: SavedScenario[]
  },
): PortfolioTradesState {
  let candidate = trade
  if (linkContext) {
    candidate = applyEquityTradeHoldingLink(
      trade,
      linkContext.portfolio,
      linkContext.scenarios ?? [],
    )
  }
  const normalized = normalizePortfolioTrade(candidate)
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

export type SymbolMarkSource = 'quote' | 'manual' | 'history'

export type SymbolMark = {
  price: number
  /** Quote / history denomination before display conversion in perf math. */
  currency: DisplayCurrency
  source: SymbolMarkSource
  /** Close date when source is history; null for live quote/manual. */
  asOfDate: string | null
}

export type SymbolPerformance = {
  symbol: string
  instrument: PortfolioTradeInstrument
  tradeCount: number
  ledgerShares: number
  costBasis: number
  markPrice: number | null
  markSource: SymbolMarkSource | null
  markAsOfDate: string | null
  marketValue: number | null
  unrealizedPnl: number | null
  realizedPnl: number
  grossBuys: number
  grossPremiumReceived: number
  totalPnl: number | null
  returnPct: number | null
  underlying?: string
}

/** Tradeable equity ticker for a position row (holding symbol or linked scenario). */
export function holdingEquityTradeSymbol(
  holding: PortfolioHolding,
  scenarios: SavedScenario[] = [],
): string | null {
  if (holding.option) return null
  const direct = holding.symbol.trim().toUpperCase()
  if (direct) return direct
  if (holding.scenarioId) {
    const sc = scenarios.find((s) => s.id === holding.scenarioId)
    const fromScenario = sc?.symbol?.trim().toUpperCase()
    if (fromScenario) return fromScenario
  }
  return null
}

/** Equity holdings on this book whose trade ticker matches `symbol` (no options). */
export function equityHoldingsForTradeSymbol(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[] = [],
  symbol: string,
): PortfolioHolding[] {
  const sym = symbol.trim().toUpperCase()
  if (!sym) return []
  const out: PortfolioHolding[] = []
  for (const h of portfolio.holdings) {
    if (h.option) continue
    const ticker = holdingEquityTradeSymbol(h, scenarios)
    if (ticker === sym) out.push(h)
  }
  return out
}

/** Link only when exactly one equity position matches the ticker. */
export function uniqueEquityHoldingForTradeSymbol(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[] = [],
  symbol: string,
): PortfolioHolding | null {
  const matches = equityHoldingsForTradeSymbol(portfolio, scenarios, symbol)
  return matches.length === 1 ? matches[0]! : null
}

/** Auto-link equity trades by unique ticker match; options and ambiguous rows stay unlinked. */
export function applyEquityTradeHoldingLink(
  trade: PortfolioTrade,
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[] = [],
): PortfolioTrade {
  if (tradeInstrument(trade) === 'option') {
    const { holdingId: _h, ...rest } = trade
    return rest
  }
  const byId =
    trade.holdingId &&
    portfolio.holdings.find((h) => h.id === trade.holdingId && !h.option)
  if (byId) return trade
  const unique = uniqueEquityHoldingForTradeSymbol(portfolio, scenarios, trade.symbol)
  if (!unique) {
    const { holdingId: _h, ...rest } = trade
    return rest
  }
  return { ...trade, holdingId: unique.id }
}

export function backfillPortfolioTradeHoldingLinks(
  state: PortfolioTradesState,
  portfolios: SavedPortfolio[],
  scenarios: SavedScenario[] = [],
): PortfolioTradesState {
  const bookById = new Map(portfolios.map((p) => [p.id, p]))
  let changed = false
  const trades = state.trades.map((t) => {
    const book = bookById.get(t.portfolioId)
    if (!book) return t
    const linked = applyEquityTradeHoldingLink(t, book, scenarios)
    if (linked.holdingId !== t.holdingId) changed = true
    return linked
  })
  if (!changed) return state
  return { ...state, trades }
}

/** Equity holding on this book matching trade symbol and/or draft `holdingId` (no options). */
export function equityHoldingForTradePrefill(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[] = [],
  input: { symbol?: string; holdingId?: string | null },
): PortfolioHolding | null {
  if (input.holdingId) {
    const byId = portfolio.holdings.find((h) => h.id === input.holdingId)
    if (byId && !byId.option) return byId
  }
  const sym = (input.symbol ?? '').trim().toUpperCase()
  if (!sym) return null
  return uniqueEquityHoldingForTradeSymbol(portfolio, scenarios, sym)
}

export function positionPrefillFromHolding(
  holding: PortfolioHolding,
  mark: SymbolMark | null,
): { shares: number; price: number | null; holdingId: string } {
  return {
    shares: holding.sharesHeld,
    price: mark != null && mark.price > 0 ? mark.price : null,
    holdingId: holding.id,
  }
}

/** Latest historical close on or before `asOfDate` (no staleness cap — for marks). */
export function latestHistoryClose(
  points: PriceHistoryPoint[],
  asOfDate: string = todayIsoDate(),
): { price: number; date: string } | null {
  let bestDate = ''
  let best: number | null = null
  for (const p of points) {
    if (p.date <= asOfDate && p.close > 0 && p.date >= bestDate) {
      bestDate = p.date
      best = p.close
    }
  }
  return best != null ? { price: best, date: bestDate } : null
}

/**
 * Mark for open ledger: projection quote, manual holding price, then history close.
 */
function intrinsicOptionMark(
  parsed: NonNullable<ReturnType<typeof parseOccSymbol>>,
  underlyingMark: SymbolMark,
): SymbolMark {
  const uPx = underlyingMark.price
  const intrinsic =
    parsed.right === 'C'
      ? Math.max(0, uPx - parsed.strike)
      : Math.max(0, parsed.strike - uPx)
  return {
    price: intrinsic,
    currency: underlyingMark.currency,
    source: 'manual',
    asOfDate: null,
  }
}

export function resolveSymbolMark(
  symbol: string,
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  historyPoints: PriceHistoryPoint[] = [],
  asOfDate: string = todayIsoDate(),
  historyQuoteCurrency?: string,
  historiesBySymbol?: Record<string, PriceHistoryPoint[]>,
): SymbolMark | null {
  const quoteCur = quoteToDisplayCurrency(historyQuoteCurrency)
  const isLiveMarkDay = asOfDate >= todayIsoDate()
  if (isOccSymbol(symbol)) {
    const parsed = parseOccSymbol(symbol)
    if (parsed && optionIsExpired(parsed.expiration, new Date(`${asOfDate}T12:00:00Z`))) {
      return { price: 0, currency: quoteCur, source: 'manual', asOfDate: null }
    }
    const optHolding = portfolio.holdings.find(
      (h) => h.option?.occSymbol.toUpperCase() === symbol.toUpperCase(),
    )
    if (isLiveMarkDay) {
      if (optHolding?.manualCurrentPrice != null && optHolding.manualCurrentPrice >= 0) {
        return {
          price: optHolding.manualCurrentPrice,
          currency: 'USD',
          source: 'manual',
          asOfDate: null,
        }
      }
      if (optHolding) {
        const px = resolveCurrentPrice(optHolding, null)
        if (px != null && px >= 0) {
          return { price: px, currency: 'USD', source: 'quote', asOfDate: null }
        }
      }
    }
    if (parsed) {
      const uKey = parsed.underlying.toUpperCase()
      const uPts = historiesBySymbol?.[uKey] ?? []
      const uCur = historiesBySymbol
        ? quoteCur
        : quoteCur
      const uMark = resolveSymbolMark(
        parsed.underlying,
        portfolio,
        scenarios,
        uPts,
        asOfDate,
        uCur,
        historiesBySymbol,
      )
      if (uMark) {
        const intrinsic = intrinsicOptionMark(parsed, uMark)
        const uHist = latestHistoryClose(uPts, asOfDate)
        if (uHist && !isLiveMarkDay) {
          return { ...intrinsic, source: 'history', asOfDate: uHist.date }
        }
        return intrinsic
      }
    }
    return null
  }
  const scenarioQuoteCur = (sc: SavedScenario | null | undefined): DisplayCurrency =>
    quoteToDisplayCurrency(sc?.currency)
  const sym = symbol.toUpperCase()
  const holding = portfolio.holdings.find(
    (h) => !h.option && h.symbol.toUpperCase() === sym,
  )
  if (holding) {
    const scenario =
      (holding.scenarioId
        ? scenarios.find((s) => s.id === holding.scenarioId)
        : null) ?? scenarios.find((s) => s.symbol.toUpperCase() === sym) ?? null
    if (
      holding.manualOnly === true &&
      holding.manualCurrentPrice != null &&
      holding.manualCurrentPrice > 0
    ) {
      return {
        price: holding.manualCurrentPrice,
        currency: scenarioQuoteCur(scenario),
        source: 'manual',
        asOfDate: null,
      }
    }
    const p = resolveCurrentPrice(holding, scenario)
    if (p != null && p > 0) {
      return { price: p, currency: scenarioQuoteCur(scenario), source: 'quote', asOfDate: null }
    }
  }
  const scenario = scenarios.find((s) => s.symbol.toUpperCase() === sym)
  if (scenario?.currentPrice != null && scenario.currentPrice > 0) {
    return {
      price: scenario.currentPrice,
      currency: scenarioQuoteCur(scenario),
      source: 'quote',
      asOfDate: null,
    }
  }
  const hist = latestHistoryClose(historyPoints, asOfDate)
  if (hist) {
    return {
      price: hist.price,
      currency: quoteCur,
      source: 'history',
      asOfDate: hist.date,
    }
  }
  return null
}

export function symbolMarkInDisplay(
  mark: SymbolMark,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): SymbolMark {
  return {
    ...mark,
    price: convertAmountToDisplay(
      mark.price,
      mark.currency,
      displayCurrency,
      usdToChf,
    ),
    currency: displayCurrency,
  }
}

/** @deprecated Prefer resolveSymbolMark */
export function markPriceForSymbol(
  symbol: string,
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
): number | null {
  return resolveSymbolMark(symbol, portfolio, scenarios)?.price ?? null
}

/** Average-cost ledger per symbol from executed trades. */
export function computeSymbolPerformance(
  trades: PortfolioTrade[],
  mark: SymbolMark | number | null,
  asOfDate: string = todayIsoDate(),
  perfCtx?: PerfDisplayContext,
): SymbolPerformance | null {
  if (trades.length === 0) return null
  const expanded = withAutoExpireTrades(trades, asOfDate)
  const markPrice =
    mark == null
      ? null
      : typeof mark === 'number'
        ? mark
        : mark.price
  const markSource =
    mark != null && typeof mark !== 'number' ? mark.source : null
  const markAsOfDate =
    mark != null && typeof mark !== 'number' ? mark.asOfDate : null
  const symbol = trades[0]!.symbol
  const instrument = tradeInstrument(trades[0]!)
  const markInDisplay =
    mark != null && typeof mark !== 'number' && perfCtx
      ? symbolMarkInDisplay(mark, perfCtx.displayCurrency, perfCtx.usdToChf).price
      : markPrice

  const ledger = computeLedgerPerformance(expanded, markInDisplay, perfCtx)
  const underlying = parseOccSymbol(symbol)?.underlying

  return {
    symbol,
    instrument,
    tradeCount: trades.length,
    ledgerShares: ledger.shares,
    costBasis: ledger.costBasis,
    markPrice: markInDisplay,
    markSource,
    markAsOfDate,
    marketValue: ledger.marketValue,
    unrealizedPnl: ledger.unrealizedPnl,
    realizedPnl: ledger.realizedPnl,
    grossBuys: ledger.grossBuys,
    grossPremiumReceived: ledger.grossPremiumReceived,
    totalPnl: ledger.totalPnl,
    returnPct: ledger.returnPct,
    underlying,
  }
}

export function formatSymbolMarkLine(perf: SymbolPerformance): string | null {
  if (perf.ledgerShares <= 0 || perf.markPrice == null) return null
  if (perf.markSource === 'history' && perf.markAsOfDate) {
    return `History close ${perf.markAsOfDate}`
  }
  if (perf.markSource === 'manual') return 'Manual mark'
  if (perf.markSource === 'quote') return 'Live quote'
  return null
}

export function formatSnapshotMarkSummary(symbols: SymbolPerformance[]): string | null {
  const open = symbols.filter((s) => s.ledgerShares !== 0 && s.markSource)
  if (open.length === 0) return null
  const parts = open.map((s) => {
    const label = formatSymbolMarkLine(s)
    return label ? `${s.symbol}: ${label}` : s.symbol
  })
  if (parts.length <= 2) return `Mark — ${parts.join('; ')}`
  return `Mark — ${parts.slice(0, 2).join('; ')}; +${parts.length - 2} more`
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
  historiesBySymbol: Record<string, PriceHistoryPoint[]> = {},
  asOfDate: string = todayIsoDate(),
  perfCtx?: PerfDisplayContext,
): PortfolioPerformanceSummary {
  const display = perfCtx?.displayCurrency ?? 'USD'
  const usdToChf = perfCtx?.usdToChf ?? null

  const bySymbol = new Map<string, PortfolioTrade[]>()
  for (const t of trades) {
    const list = bySymbol.get(t.symbol) ?? []
    list.push(t)
    bySymbol.set(t.symbol, list)
  }
  const symbols: SymbolPerformance[] = []
  for (const [sym, list] of bySymbol) {
    const histCur = perfCtx?.quoteCurrencyBySymbol[sym]
    const histPts = isOccSymbol(sym) ? [] : historiesBySymbol[sym] ?? []
    const markRaw = resolveSymbolMark(
      sym,
      portfolio,
      scenarios,
      histPts,
      asOfDate,
      histCur === 'CHF' ? 'CHF' : histCur === 'USD' ? 'USD' : undefined,
      historiesBySymbol,
    )
    const mark =
      markRaw && perfCtx
        ? symbolMarkInDisplay(markRaw, display, usdToChf)
        : markRaw
    const perf = computeSymbolPerformance(list, mark, asOfDate, perfCtx)
    if (perf) symbols.push(perf)
  }
  symbols.sort((a, b) => a.symbol.localeCompare(b.symbol))

  let realizedPnl = 0
  let unrealizedPnl = 0
  let grossBuys = 0
  let premiumDenom = 0
  for (const s of symbols) {
    realizedPnl += s.realizedPnl
    unrealizedPnl += s.unrealizedPnl ?? 0
    grossBuys += s.grossBuys
    premiumDenom += s.grossPremiumReceived
  }
  const totalPnl = realizedPnl + unrealizedPnl
  const denom = grossBuys + premiumDenom
  const returnPct = denom > 0 ? totalPnl / denom : null
  return { realizedPnl, unrealizedPnl, totalPnl, grossBuys, returnPct, symbols }
}

export { performanceScopeKeys, tradesForPerformanceScope } from './portfolioTradeLedger'