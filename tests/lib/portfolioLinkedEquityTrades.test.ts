import { describe, expect, it } from 'vitest'
import {
  equityTradeMatchesLinkedOption,
  expectedEquitySideForOptionLifecycle,
  linkedEquityTradeCandidates,
  stripLinkedTradeIdUnlessLifecycleOption,
} from '../../src/lib/portfolioLinkedEquityTrades'
import { normalizePortfolioTrade } from '../../src/lib/portfolioTrades'
import type { PortfolioTrade } from '../../src/types'

const PORT_ID = '11111111-1111-4111-8111-111111111111'

function optAssign(overrides: Record<string, unknown> = {}): PortfolioTrade {
  return normalizePortfolioTrade({
    portfolioId: PORT_ID,
    instrument: 'option',
    symbol: 'PLTR250919C00047000',
    side: 'buy',
    tradeDate: '2025-09-19',
    shares: 2,
    price: 0,
    event: 'assign',
    currency: 'USD',
    ...overrides,
  })!
}

function eqSell(overrides: Record<string, unknown> = {}): PortfolioTrade {
  return normalizePortfolioTrade({
    portfolioId: PORT_ID,
    symbol: 'PLTR',
    side: 'sell',
    tradeDate: '2025-09-19',
    shares: 200,
    price: 47,
    currency: 'USD',
    ...overrides,
  })!
}

describe('portfolioLinkedEquityTrades', () => {
  it('derives expected stock side from right and lifecycle event', () => {
    expect(expectedEquitySideForOptionLifecycle('assign', 'C')).toBe('sell')
    expect(expectedEquitySideForOptionLifecycle('assign', 'P')).toBe('buy')
    expect(expectedEquitySideForOptionLifecycle('exercise', 'C')).toBe('buy')
    expect(expectedEquitySideForOptionLifecycle('exercise', 'P')).toBe('sell')
    expect(expectedEquitySideForOptionLifecycle('expire', 'C')).toBeNull()
  })

  it('filters equity candidates on book, underlying, date, side, and share count', () => {
    const assign = optAssign()
    const match = eqSell({ id: 'eq-ok' })
    const wrongBook = eqSell({
      id: 'eq-book',
      portfolioId: '22222222-2222-4222-8222-222222222222',
    })
    const wrongSide = eqSell({ id: 'eq-side', side: 'buy' })
    const wrongDate = eqSell({ id: 'eq-date', tradeDate: '2025-08-01' })
    const wrongSize = eqSell({ id: 'eq-size', shares: 100 })

    const query = {
      id: assign.id,
      portfolioId: PORT_ID,
      symbol: assign.symbol,
      tradeDate: assign.tradeDate,
      shares: assign.shares,
      multiplier: 100,
      event: 'assign' as const,
      underlying: 'PLTR',
      right: 'C' as const,
    }

    expect(equityTradeMatchesLinkedOption(query, match)).toBe(true)
    expect(equityTradeMatchesLinkedOption(query, wrongBook)).toBe(false)
    expect(equityTradeMatchesLinkedOption(query, wrongSide)).toBe(false)
    expect(equityTradeMatchesLinkedOption(query, wrongDate)).toBe(false)
    expect(equityTradeMatchesLinkedOption(query, wrongSize)).toBe(false)

    const candidates = linkedEquityTradeCandidates(query, [
      assign,
      match,
      wrongBook,
      wrongSide,
      wrongDate,
      wrongSize,
    ])
    expect(candidates.map((t) => t.id)).toEqual(['eq-ok'])
  })

  it('retains a saved link when the equity row no longer matches filters', () => {
    const assign = optAssign({ linkedTradeId: 'eq-stale' })
    const stale = eqSell({ id: 'eq-stale', shares: 50 })
    const query = {
      id: assign.id,
      portfolioId: PORT_ID,
      symbol: assign.symbol,
      tradeDate: assign.tradeDate,
      shares: assign.shares,
      multiplier: 100,
      event: 'assign' as const,
      underlying: 'PLTR',
      right: 'C' as const,
      linkedTradeId: 'eq-stale',
    }
    const candidates = linkedEquityTradeCandidates(query, [assign, stale])
    expect(candidates.map((t) => t.id)).toEqual(['eq-stale'])
  })

  it('strips linkedTradeId unless option assign or exercise', () => {
    const assign = optAssign({ linkedTradeId: 'eq-1' })
    expect(stripLinkedTradeIdUnlessLifecycleOption(assign).linkedTradeId).toBe('eq-1')
    const expire = optAssign({ event: 'expire', linkedTradeId: 'eq-1' })
    expect(stripLinkedTradeIdUnlessLifecycleOption(expire).linkedTradeId).toBeUndefined()
    const equity = eqSell({ linkedTradeId: 'eq-1' })
    expect(stripLinkedTradeIdUnlessLifecycleOption(equity).linkedTradeId).toBeUndefined()
  })
})