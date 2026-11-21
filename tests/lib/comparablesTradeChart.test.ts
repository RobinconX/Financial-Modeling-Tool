import { describe, expect, it } from 'vitest'
import type { PortfolioTrade } from '../../src/types'
import {
  buildComparablesTradeMarkers,
  chartDateForTrade,
  chartValueAtDate,
  tradesForComparablesTooltip,
} from '../../src/lib/comparablesTradeChart'

const PORT_ID = '11111111-1111-4111-8111-111111111111'

function trade(
  partial: Partial<PortfolioTrade> & Pick<PortfolioTrade, 'side' | 'tradeDate' | 'symbol'>,
): PortfolioTrade {
  return {
    id: partial.id ?? crypto.randomUUID(),
    portfolioId: PORT_ID,
    symbol: partial.symbol,
    side: partial.side,
    tradeDate: partial.tradeDate,
    shares: partial.shares ?? 1,
    price: partial.price ?? 100,
    fees: partial.fees ?? 0,
  }
}

describe('comparablesTradeChart', () => {
  const points = [
    { date: '2024-01-02', upside: 0.5 },
    { date: '2024-01-05', upside: 0.4 },
    { date: '2024-01-10', upside: 0.2 },
  ]

  it('anchors trade to nearest prior history date', () => {
    expect(chartDateForTrade('2024-01-07', points)).toBe('2024-01-05')
    expect(chartValueAtDate(points, '2024-01-05')).toBe(0.4)
  })

  it('builds markers only for overlay tickers and series', () => {
    const markers = buildComparablesTradeMarkers(
      [
        trade({ symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-07' }),
        trade({ symbol: 'MSFT', side: 'sell', tradeDate: '2024-01-05' }),
      ],
      new Set(['AAPL']),
      [{ key: 'sc-aapl', symbol: 'AAPL', points }],
    )
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({
      symbol: 'AAPL',
      side: 'buy',
      chartDate: '2024-01-05',
      y: 0.4,
    })
  })

  it('lists trades on tooltip day by chart anchor date', () => {
    const markers = buildComparablesTradeMarkers(
      [trade({ id: 't1', symbol: 'AAPL', side: 'buy', tradeDate: '2024-01-07' })],
      new Set(['AAPL']),
      [{ key: 'sc1', symbol: 'AAPL', points }],
    )
    expect(tradesForComparablesTooltip('2024-01-05', markers)).toHaveLength(1)
    expect(tradesForComparablesTooltip('2024-01-02', markers)).toHaveLength(0)
  })
})