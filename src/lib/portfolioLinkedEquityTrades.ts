import type { PortfolioTrade, PortfolioTradeEvent, PortfolioTradeSide } from '../types'
import { parseOccSymbol } from './optionContract'
import { tradeEvent, tradeInstrument } from './portfolioTradeLedger'

const LINKED_EQUITY_MAX_DATE_OFFSET_DAYS = 7
const LINKED_EQUITY_SHARE_TOLERANCE = 0.02

export type LinkedEquityTradeQuery = {
  /** Trade row being edited (excluded from reverse links). */
  id?: string
  portfolioId: string
  symbol: string
  tradeDate: string
  /** Option contracts when filtering equity follow-on rows. */
  shares: number
  multiplier?: number
  event: PortfolioTradeEvent
  underlying?: string
  right?: 'C' | 'P'
  linkedTradeId?: string | null
}

function daysBetween(isoA: string, isoB: string): number {
  const a = Date.parse(`${isoA}T12:00:00Z`)
  const b = Date.parse(`${isoB}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY
  return Math.round(Math.abs(a - b) / 86_400_000)
}

/** Stock side that typically pairs with an assign / exercise lifecycle row. */
export function expectedEquitySideForOptionLifecycle(
  event: PortfolioTradeEvent,
  right: 'C' | 'P' | undefined,
): PortfolioTradeSide | null {
  if (event !== 'assign' && event !== 'exercise') return null
  if (right !== 'C' && right !== 'P') return null
  const isSell =
    (event === 'assign' && right === 'C') || (event === 'exercise' && right === 'P')
  return isSell ? 'sell' : 'buy'
}

function equityEvent(t: PortfolioTrade): PortfolioTradeEvent {
  return t.event ?? 'trade'
}

function resolveOptionUnderlying(query: LinkedEquityTradeQuery): string | null {
  if (query.underlying?.trim()) return query.underlying.trim().toUpperCase()
  const parsed = parseOccSymbol(query.symbol.trim().toUpperCase())
  return parsed?.underlying ?? null
}

function expectedShareCount(query: LinkedEquityTradeQuery): number | null {
  const contracts = query.shares
  if (!Number.isFinite(contracts) || contracts <= 0) return null
  const mult =
    query.multiplier != null && Number.isFinite(query.multiplier) && query.multiplier > 0
      ? query.multiplier
      : 100
  return contracts * mult
}

function sharesMatch(expected: number, actual: number): boolean {
  if (!Number.isFinite(actual) || actual <= 0) return false
  const diff = Math.abs(actual - expected)
  return diff <= LINKED_EQUITY_SHARE_TOLERANCE || diff / expected <= 0.001
}

export function equityTradeMatchesLinkedOption(
  query: LinkedEquityTradeQuery,
  equity: PortfolioTrade,
): boolean {
  if (tradeInstrument(equity) !== 'equity') return false
  if (equity.portfolioId !== query.portfolioId) return false
  if (equityEvent(equity) !== 'trade') return false
  const underlying = resolveOptionUnderlying(query)
  if (!underlying) return false
  if (equity.symbol.trim().toUpperCase() !== underlying) return false
  const expectedSide = expectedEquitySideForOptionLifecycle(query.event, query.right)
  if (expectedSide && equity.side !== expectedSide) return false
  const offset = daysBetween(query.tradeDate, equity.tradeDate)
  if (offset > LINKED_EQUITY_MAX_DATE_OFFSET_DAYS) return false
  const expectedShares = expectedShareCount(query)
  if (expectedShares == null) return false
  return sharesMatch(expectedShares, equity.shares)
}

export function linkedEquityTradeCandidates(
  query: LinkedEquityTradeQuery,
  bookTrades: PortfolioTrade[],
): PortfolioTrade[] {
  if (query.event !== 'assign' && query.event !== 'exercise') return []
  const underlying = resolveOptionUnderlying(query)
  if (!underlying || !query.tradeDate || query.shares <= 0) return []

  const keepId = query.linkedTradeId?.trim()
  const matches: PortfolioTrade[] = []
  const seen = new Set<string>()

  for (const t of bookTrades) {
    if (t.id === query.id) continue
    if (equityTradeMatchesLinkedOption(query, t)) {
      matches.push(t)
      seen.add(t.id)
    }
  }

  if (keepId && !seen.has(keepId)) {
    const pinned = bookTrades.find((t) => t.id === keepId)
    if (pinned) matches.unshift(pinned)
  }

  matches.sort((a, b) => {
    const aPinned = a.id === keepId ? 0 : 1
    const bPinned = b.id === keepId ? 0 : 1
    if (aPinned !== bPinned) return aPinned - bPinned
    const aSameDay = a.tradeDate === query.tradeDate ? 0 : 1
    const bSameDay = b.tradeDate === query.tradeDate ? 0 : 1
    if (aSameDay !== bSameDay) return aSameDay - bSameDay
    const byDate = daysBetween(query.tradeDate, a.tradeDate) - daysBetween(query.tradeDate, b.tradeDate)
    if (byDate !== 0) return byDate
    return a.id.localeCompare(b.id)
  })

  return matches
}

export function formatLinkedEquityTradeLabel(t: PortfolioTrade): string {
  const sh =
    Math.abs(t.shares - Math.round(t.shares)) < 0.0001
      ? String(Math.round(t.shares))
      : t.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })
  return `${t.symbol} ${t.side} ${sh} · ${t.tradeDate}`
}

export function stripLinkedTradeIdUnlessLifecycleOption(trade: PortfolioTrade): PortfolioTrade {
  if (tradeInstrument(trade) !== 'option') {
    const { linkedTradeId: _l, ...rest } = trade
    return rest
  }
  const ev = tradeEvent(trade)
  if (ev !== 'assign' && ev !== 'exercise') {
    const { linkedTradeId: _l, ...rest } = trade
    return rest
  }
  return trade
}

export function optionTradesLinkingToEquity(
  equityTradeId: string,
  bookTrades: PortfolioTrade[],
): PortfolioTrade[] {
  return bookTrades.filter(
    (t) =>
      tradeInstrument(t) === 'option' &&
      (tradeEvent(t) === 'assign' || tradeEvent(t) === 'exercise') &&
      t.linkedTradeId === equityTradeId,
  )
}