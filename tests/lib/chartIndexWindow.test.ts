import { describe, expect, it } from 'vitest'
import {
  indexWindowFromDates,
  panIndexWindow,
  zoomIndexWindow,
} from '../../src/lib/chartIndexWindow'

function isoDay(base: string, offset: number): string {
  const t = Date.parse(`${base}T12:00:00Z`) + offset * 86_400_000
  return new Date(t).toISOString().slice(0, 10)
}

const SERIES = Array.from({ length: 100 }, (_, i) => ({
  date: isoDay('2020-01-01', i),
}))

describe('zoomIndexWindow', () => {
  it('zooms in around anchor fraction', () => {
    const next = zoomIndexWindow(100, 0, 99, 0.5, true, 20)
    expect(next.end - next.start).toBeLessThan(99)
    expect(next.start).toBeGreaterThanOrEqual(0)
    expect(next.end).toBeLessThanOrEqual(99)
  })

  it('zooms out to full range when already at edges', () => {
    expect(zoomIndexWindow(100, 0, 99, 0.5, false, 20)).toEqual({ start: 0, end: 99 })
  })
})

describe('panIndexWindow', () => {
  it('shifts window right without changing span', () => {
    const next = panIndexWindow(100, 10, 40, 5)
    expect(next.start).toBe(15)
    expect(next.end).toBe(45)
  })

  it('clamps pan at series end', () => {
    const next = panIndexWindow(100, 80, 99, 10)
    expect(next.end).toBe(99)
    expect(next.end - next.start).toBe(19)
  })
})

describe('indexWindowFromDates', () => {
  it('returns full range when window is null', () => {
    expect(indexWindowFromDates(SERIES, null)).toEqual({ start: 0, end: 99 })
  })

  it('maps date window to inclusive indices', () => {
    const win = { from: SERIES[20]!.date, to: SERIES[50]!.date }
    const { start, end } = indexWindowFromDates(SERIES, win)
    expect(start).toBe(20)
    expect(end).toBe(50)
  })
})