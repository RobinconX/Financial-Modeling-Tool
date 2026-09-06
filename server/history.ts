/** Daily closes from 1 Jan 2022 through today (Yahoo chart). */

export const PRICE_HISTORY_START_YEAR = 2022

export type PriceHistoryPoint = {
  date: string
  close: number
}

export type PriceHistoryResult = {
  symbol: string
  currency: string
  points: PriceHistoryPoint[]
}

const YAHOO_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

const SYMBOL_RE = /^[A-Z0-9.^=_-]{1,21}$/
const HISTORY_TIMEOUT_MS = 8000

type YahooHistoryResponse = {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; currency?: string }
      timestamp?: number[]
      indicators?: { quote?: Array<{ close?: Array<number | null> }> }
    }>
    error?: { description?: string } | null
  }
}

function normalizeSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase()
  if (!symbol || !SYMBOL_RE.test(symbol)) return null
  return symbol
}

function isoDateUtc(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10)
}

function fetchTimeoutSignal(ms: number): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
      return AbortSignal.timeout(ms)
    }
  } catch {
    /* ignore */
  }
  return undefined
}

export function historyPeriodRange(
  asOf: Date = new Date(),
  startYear = PRICE_HISTORY_START_YEAR,
): { period1: number; period2: number } {
  const period1 = Math.floor(Date.UTC(startYear, 0, 1) / 1000)
  const period2 = Math.floor(asOf.getTime() / 1000)
  return { period1, period2: Math.max(period1, period2) }
}

export function parseYahooHistoryChart(
  json: YahooHistoryResponse,
  symbol: string,
  minDate = `${PRICE_HISTORY_START_YEAR}-01-01`,
): PriceHistoryResult {
  const result = json.chart?.result?.[0]
  const timestamps = result?.timestamp ?? []
  const closes = result?.indicators?.quote?.[0]?.close ?? []
  const currency = result?.meta?.currency?.trim() || 'USD'
  const points: PriceHistoryPoint[] = []
  const n = Math.min(timestamps.length, closes.length)
  for (let i = 0; i < n; i++) {
    const ts = timestamps[i]
    const close = closes[i]
    if (ts == null || close == null || !Number.isFinite(close) || !(close > 0)) continue
    const date = isoDateUtc(ts)
    if (date < minDate) continue
    points.push({ date, close })
  }
  return { symbol, currency, points }
}

export async function fetchPriceHistory(rawSymbol: string): Promise<PriceHistoryResult> {
  const symbol = normalizeSymbol(rawSymbol)
  if (!symbol) throw new Error('Invalid ticker symbol')

  const { period1, period2 } = historyPeriodRange()
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}`
  const signal = fetchTimeoutSignal(HISTORY_TIMEOUT_MS)
  const res = await fetch(url, {
    headers: YAHOO_HEADERS,
    ...(signal ? { signal } : {}),
  })
  if (!res.ok) throw new Error(`History API failed for ${symbol}`)
  const json = (await res.json()) as YahooHistoryResponse
  if (json.chart?.error?.description) {
    throw new Error(json.chart.error.description)
  }
  if (!json.chart?.result?.[0]) {
    throw new Error(`No history for symbol ${symbol}`)
  }
  return parseYahooHistoryChart(json, symbol)
}
