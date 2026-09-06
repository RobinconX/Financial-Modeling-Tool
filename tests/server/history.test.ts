import { describe, expect, it } from 'vitest'
import {
  fetchPriceHistory,
  historyPeriodRange,
  parseYahooHistoryChart,
  PRICE_HISTORY_START_YEAR,
} from '../../server/history'

describe('historyPeriodRange', () => {
  it('starts at 1 Jan 2022 UTC', () => {
    const { period1, period2 } = historyPeriodRange(new Date('2026-09-06T12:00:00Z'))
    expect(PRICE_HISTORY_START_YEAR).toBe(2022)
    expect(period1).toBe(Math.floor(Date.UTC(2022, 0, 1) / 1000))
    expect(period2).toBeGreaterThan(period1)
  })
})

describe('parseYahooHistoryChart', () => {
  it('pairs timestamps with closes and skips nulls and pre-2022 dates', () => {
    const out = parseYahooHistoryChart(
      {
        chart: {
          result: [
            {
              meta: { symbol: 'AAPL', currency: 'USD' },
              timestamp: [
                Math.floor(Date.UTC(2021, 11, 31) / 1000),
                Math.floor(Date.UTC(2022, 0, 3) / 1000),
                Math.floor(Date.UTC(2022, 5, 1) / 1000),
              ],
              indicators: {
                quote: [{ close: [99, 120, null] }],
              },
            },
          ],
        },
      },
      'AAPL',
    )
    expect(out.symbol).toBe('AAPL')
    expect(out.points).toEqual([{ date: '2022-01-03', close: 120 }])
  })
})

describe('fetchPriceHistory', () => {
  it('rejects invalid symbols', async () => {
    await expect(fetchPriceHistory('')).rejects.toThrow(/Invalid ticker/)
    await expect(fetchPriceHistory('!!!')).rejects.toThrow(/Invalid ticker/)
  })
})
