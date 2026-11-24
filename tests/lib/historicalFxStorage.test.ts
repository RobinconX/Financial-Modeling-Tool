import { beforeEach, describe, expect, it } from 'vitest'
import {
  FX_DAILY_STORAGE_KEY,
  cacheFxRateForDate,
  mergeFxDailyCacheFromSnapshot,
  parseFxDailyRatesMap,
  readFxDailyCache,
} from '../../src/lib/historicalFxStorage'

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v))
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    },
  })
})

describe('historicalFxStorage snapshot helpers', () => {
  it('parseFxDailyRatesMap returns undefined when field is absent', () => {
    expect(parseFxDailyRatesMap(undefined)).toBeUndefined()
  })

  it('parseFxDailyRatesMap ignores invalid shapes and entries', () => {
    expect(parseFxDailyRatesMap(null)).toBeUndefined()
    expect(parseFxDailyRatesMap([])).toBeUndefined()
    expect(parseFxDailyRatesMap('bad')).toBeUndefined()
    expect(
      parseFxDailyRatesMap({
        '2024-01-01': 0.88,
        'not-a-date': 1,
        '2024-01-02': 'nope',
        '2024-01-03': -1,
        '2024-01-04': 0,
      }),
    ).toEqual({ '2024-01-01': 0.88 })
  })

  it('mergeFxDailyCacheFromSnapshot fills gaps without overwriting local', () => {
    cacheFxRateForDate('2024-06-01', 0.9)
    cacheFxRateForDate('2024-06-02', 0.91)
    mergeFxDailyCacheFromSnapshot({
      '2024-06-01': 0.5,
      '2024-06-03': 0.92,
      bad: 0.8,
    })
    expect(readFxDailyCache()).toEqual({
      '2024-06-01': 0.9,
      '2024-06-02': 0.91,
      '2024-06-03': 0.92,
    })
  })

  it('round-trips through localStorage store shape', () => {
    cacheFxRateForDate('2024-03-15', 0.887)
    const raw = store.get(FX_DAILY_STORAGE_KEY)
    expect(raw).toBeTruthy()
    store.clear()
    store.set(FX_DAILY_STORAGE_KEY, raw!)
    expect(readFxDailyCache()).toEqual({ '2024-03-15': 0.887 })
  })
})