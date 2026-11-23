import { optionLabel, parseOccSymbol } from './optionContract'
import type { PortfolioTrade, PortfolioTradeEvent } from '../types'

export type TradeMarkerDisplayInput = {
  symbol: string
  side: PortfolioTrade['side']
  instrument: 'equity' | 'option'
  event?: PortfolioTrade['event']
  occSymbol?: string
  label?: string
}

function normalizedTradeEvent(
  event: PortfolioTrade['event'] | undefined,
): PortfolioTradeEvent {
  if (event === 'expire' || event === 'assign' || event === 'exercise') return event
  return 'trade'
}

export function isOptionLifecycleEvent(
  instrument: 'equity' | 'option',
  event: PortfolioTrade['event'] | undefined,
): boolean {
  return (
    instrument === 'option' &&
    (event === 'expire' || event === 'assign' || event === 'exercise')
  )
}

/** Readable contract title for tooltip headers (equity ticker or OCC breakdown). */
export function tradeMarkerContractLabel(m: TradeMarkerDisplayInput): string {
  if (m.instrument === 'option') {
    if (m.label?.trim()) return m.label.trim()
    const occ = m.occSymbol?.trim() || m.symbol.trim()
    const parsed = parseOccSymbol(occ)
    if (parsed) return optionLabel(parsed)
    return occ
  }
  return m.symbol
}

export function tradeMarkerActionLabel(m: TradeMarkerDisplayInput): string {
  if (m.instrument !== 'option') {
    return m.side === 'buy' ? 'Buy' : 'Sell'
  }
  const ev = normalizedTradeEvent(m.event)
  if (ev === 'expire') return 'Expired'
  if (ev === 'assign') return 'Assigned'
  if (ev === 'exercise') return 'Exercised'
  return m.side === 'sell' ? 'Sell to open (option)' : 'Buy to close (option)'
}

export function tradeMarkerActionColor(m: TradeMarkerDisplayInput): string {
  if (m.instrument === 'option') {
    if (isOptionLifecycleEvent(m.instrument, m.event)) return '#f59e0b'
    return '#fbbf24'
  }
  return m.side === 'buy' ? '#34d399' : '#f87171'
}

export function tradeMarkerQuantityUnit(m: TradeMarkerDisplayInput): string {
  return m.instrument === 'option' ? 'ct' : 'sh'
}