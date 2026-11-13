import {
  isIndexSymbol,
  nasdaqAssetClassOrder,
  normalizeInstrumentType,
} from '../src/lib/instrumentType'

export type Quote = {
  symbol: string
  name: string
  price: number
  currency: string
  marketCap: number | null
  sharesOutstanding: number | null
  instrumentType: string | null
}

type YahooChartMeta = {
  symbol?: string
  currency?: string
  regularMarketPrice?: number
  chartPreviousClose?: number
  previousClose?: number
  longName?: string
  shortName?: string
  instrumentType?: string
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: YahooChartMeta
    }>
    error?: { description?: string } | null
  }
}

/** Yahoo spark — multi-symbol price (v7/quote is unauthorized now). */
type YahooSparkResponse = {
  spark?: {
    result?: Array<{
      symbol?: string
      response?: Array<{
        meta?: YahooChartMeta
      }>
    }>
    error?: { description?: string } | null
  }
}

type NasdaqSummaryResponse = {
  data?: {
    symbol?: string
    summaryData?: {
      MarketCap?: { value?: string }
      AUM?: { value?: string; label?: string }
    }
  }
}

type NasdaqInfoResponse = {
  data?: {
    symbol?: string
    companyName?: string
    primaryData?: {
      lastSalePrice?: string
    }
  }
}

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

/** Symbols per spark request (URL length + practical limit). */
const YAHOO_BATCH_SIZE = 40

/** Upstream timeouts — Nasdaq is often the slow leg of multi-ticker batch. */
const SPARK_TIMEOUT_MS = 5000
const NASDAQ_TIMEOUT_MS = 1800
const NASDAQ_SINGLE_TIMEOUT_MS = 4500
const CHART_TIMEOUT_MS = 4000

/** Equity tickers plus OCC option symbols (e.g. AAPL260821C00150000). */
const SYMBOL_RE = /^[A-Z0-9.^=_-]{1,21}$/
const OCC_RE = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/

export function isOccQuoteSymbol(symbol: string): boolean {
  return OCC_RE.test(symbol.trim().toUpperCase())
}

export type FetchQuotesOptions = {
  /**
   * Spark prices only — skip Nasdaq mcap enrichment and slow per-symbol fallback.
   * Use for background refresh when the client already has mcap/shares.
   */
  pricesOnly?: boolean
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

async function fetchJson(
  url: string,
  timeoutMs: number,
): Promise<{ ok: boolean; json: () => Promise<unknown> } | null> {
  try {
    const signal = fetchTimeoutSignal(timeoutMs)
    const res = await fetch(url, {
      headers: YAHOO_HEADERS,
      ...(signal ? { signal } : {}),
    })
    return res
  } catch {
    return null
  }
}

function parseNasdaqMoney(value: string | undefined): number | null {
  if (!value || value === 'N/A') return null
  const cleaned = value.replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Nasdaq AUM field is quoted in thousands (per field label). */
function parseNasdaqAum(value: string | undefined): number | null {
  const n = parseNasdaqMoney(value)
  if (n == null) return null
  return n * 1000
}

function parseNasdaqPrice(value: string | undefined): number | null {
  if (!value) return null
  const n = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

function normalizeSymbol(raw: string): string | null {
  const symbol = raw.trim().toUpperCase()
  if (!symbol || !SYMBOL_RE.test(symbol)) return null
  return symbol
}

function instrumentTypeForSymbol(
  symbol: string,
  fromYahoo: string | null | undefined,
): string | null {
  const yahoo = normalizeInstrumentType(fromYahoo ?? null)
  if (yahoo) return yahoo
  if (isIndexSymbol(symbol)) return 'INDEX'
  return null
}

function marketCapFromNasdaqSummary(summaryJson: NasdaqSummaryResponse): number | null {
  const mcap = parseNasdaqMoney(summaryJson.data?.summaryData?.MarketCap?.value)
  if (mcap != null) return mcap
  return parseNasdaqAum(summaryJson.data?.summaryData?.AUM?.value)
}

function quoteFromFields(fields: {
  symbol: string
  name?: string | null
  price: number
  currency?: string | null
  marketCap?: number | null
  sharesOutstanding?: number | null
  instrumentType?: string | null
}): Quote {
  const price = fields.price
  const marketCap =
    fields.marketCap != null && Number.isFinite(fields.marketCap) && fields.marketCap > 0
      ? fields.marketCap
      : null
  let sharesOutstanding =
    fields.sharesOutstanding != null &&
    Number.isFinite(fields.sharesOutstanding) &&
    fields.sharesOutstanding > 0
      ? fields.sharesOutstanding
      : null
  if (sharesOutstanding == null && marketCap != null && price > 0) {
    sharesOutstanding = marketCap / price
  }
  return {
    symbol: fields.symbol,
    name: fields.name?.trim() || fields.symbol,
    price,
    currency: fields.currency?.trim() || 'USD',
    marketCap,
    sharesOutstanding,
    instrumentType: instrumentTypeForSymbol(fields.symbol, fields.instrumentType),
  }
}

async function fetchYahooChart(symbol: string): Promise<{
  price: number
  name: string
  currency: string
  instrumentType: string | null
} | null> {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const chartRes = await fetchJson(chartUrl, CHART_TIMEOUT_MS)
  if (!chartRes?.ok) return null

  const chartJson = (await chartRes.json()) as YahooChartResponse
  const meta = chartJson.chart?.result?.[0]?.meta
  if (!meta) return null

  const price =
    meta.regularMarketPrice ?? meta.chartPreviousClose ?? meta.previousClose ?? null
  if (price == null || !Number.isFinite(price)) return null

  return {
    price,
    name: meta.longName ?? meta.shortName ?? symbol,
    currency: meta.currency ?? 'USD',
    instrumentType: instrumentTypeForSymbol(symbol, meta.instrumentType),
  }
}

async function fetchNasdaqMarketCap(
  symbol: string,
  instrumentType: string | null,
  timeoutMs = NASDAQ_SINGLE_TIMEOUT_MS,
): Promise<{
  marketCap: number | null
  name: string | null
  price: number | null
}> {
  if (isIndexSymbol(symbol)) {
    return { marketCap: null, name: null, price: null }
  }

  const assetClasses = nasdaqAssetClassOrder(instrumentType, symbol)
  let partial: { marketCap: number | null; name: string | null; price: number | null } = {
    marketCap: null,
    name: null,
    price: null,
  }

  for (const assetClass of assetClasses) {
    try {
      const [summaryRes, infoRes] = await Promise.all([
        fetchJson(
          `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/summary?assetclass=${assetClass}`,
          timeoutMs,
        ),
        fetchJson(
          `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${assetClass}`,
          timeoutMs,
        ),
      ])

      let marketCap: number | null = null
      let name: string | null = null
      let price: number | null = null

      if (summaryRes?.ok) {
        const summaryJson = (await summaryRes.json()) as NasdaqSummaryResponse
        marketCap = marketCapFromNasdaqSummary(summaryJson)
      }
      if (infoRes?.ok) {
        const infoJson = (await infoRes.json()) as NasdaqInfoResponse
        name = infoJson.data?.companyName ?? null
        price = parseNasdaqPrice(infoJson.data?.primaryData?.lastSalePrice)
      }

      if (marketCap != null) {
        return {
          marketCap,
          name: name ?? partial.name,
          price: price ?? partial.price,
        }
      }

      if (price != null || name) {
        partial = {
          marketCap: null,
          name: name ?? partial.name,
          price: price ?? partial.price,
        }
      }
    } catch {
      // try next asset class
    }
  }
  return partial
}

/**
 * One Yahoo spark request for many symbols (price + name + currency).
 * Market cap is not in spark — filled separately via Nasdaq.
 */
async function fetchYahooSparkBatch(symbols: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>()
  if (symbols.length === 0) return out

  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols
    .map((s) => encodeURIComponent(s))
    .join(',')}&range=1d&interval=1d`
  const res = await fetchJson(url, SPARK_TIMEOUT_MS)
  if (!res?.ok) return out

  const json = (await res.json()) as YahooSparkResponse
  for (const row of json.spark?.result ?? []) {
    const meta = row.response?.[0]?.meta
    const symbol = (meta?.symbol ?? row.symbol)?.toUpperCase()
    if (!symbol) continue
    const price =
      meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? meta?.previousClose ?? null
    if (price == null || !Number.isFinite(price)) continue
    out.set(
      symbol,
      quoteFromFields({
        symbol,
        name: meta?.longName ?? meta?.shortName ?? symbol,
        price,
        currency: meta?.currency,
        marketCap: null,
        sharesOutstanding: null,
        instrumentType: meta?.instrumentType,
      }),
    )
  }
  return out
}

/** Lightweight mcap-only (summary endpoint). Parallelized for batch enrichment. */
async function fetchNasdaqMarketCapOnly(
  symbol: string,
  instrumentType: string | null,
): Promise<number | null> {
  if (isIndexSymbol(symbol)) return null
  const assetClasses = nasdaqAssetClassOrder(instrumentType, symbol)
  for (const assetClass of assetClasses) {
    try {
      const res = await fetchJson(
        `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/summary?assetclass=${assetClass}`,
        NASDAQ_TIMEOUT_MS,
      )
      if (!res?.ok) continue
      const json = (await res.json()) as NasdaqSummaryResponse
      const mcap = marketCapFromNasdaqSummary(json)
      if (mcap != null) return mcap
    } catch {
      // try next
    }
  }
  return null
}

/** Attach market cap (+ derived shares) to spark quotes in parallel. */
async function enrichQuotesWithMarketCap(quotes: Map<string, Quote>): Promise<void> {
  const entries = [...quotes.entries()]
  if (entries.length === 0) return

  const caps = await Promise.all(
    entries.map(async ([symbol, q]) => {
      try {
        return await fetchNasdaqMarketCapOnly(symbol, q.instrumentType)
      } catch {
        return null
      }
    }),
  )

  for (let i = 0; i < entries.length; i++) {
    const [symbol, q] = entries[i]!
    const marketCap = caps[i] ?? null
    if (marketCap == null) continue
    quotes.set(
      symbol,
      quoteFromFields({
        symbol: q.symbol,
        name: q.name,
        price: q.price,
        currency: q.currency,
        marketCap,
        sharesOutstanding: null, // derived in quoteFromFields from mcap/price
        instrumentType: q.instrumentType,
      }),
    )
  }
}

/** Per-symbol fallback (chart + Nasdaq) when batch misses a ticker. */
async function fetchQuoteFallback(symbol: string): Promise<Quote | null> {
  const yahoo = await fetchYahooChart(symbol)
  if (!yahoo) return null

  const nasdaq = await fetchNasdaqMarketCap(symbol, yahoo.instrumentType)

  const price = yahoo.price ?? nasdaq.price
  if (price == null) return null

  return quoteFromFields({
    symbol,
    name: yahoo.name ?? nasdaq.name ?? symbol,
    price,
    currency: yahoo.currency ?? 'USD',
    marketCap: nasdaq.marketCap,
    sharesOutstanding: null,
    instrumentType: yahoo.instrumentType,
  })
}

/**
 * Fetch quotes for many tickers efficiently:
 * 1. Yahoo spark batch (1 request per ~40 symbols) for price/name
 * 2. Parallel Nasdaq summary for market cap / shares (unless pricesOnly)
 * 3. Full per-symbol fallback only for misses (unless pricesOnly)
 */
export async function fetchQuotes(
  rawSymbols: string[],
  options?: FetchQuotesOptions,
): Promise<Quote[]> {
  const pricesOnly = options?.pricesOnly === true
  const unique: string[] = []
  const seen = new Set<string>()
  for (const raw of rawSymbols) {
    const s = normalizeSymbol(raw)
    if (!s || seen.has(s)) continue
    seen.add(s)
    unique.push(s)
  }
  if (unique.length === 0) return []

  const bySymbol = new Map<string, Quote>()

  for (let i = 0; i < unique.length; i += YAHOO_BATCH_SIZE) {
    const chunk = unique.slice(i, i + YAHOO_BATCH_SIZE)
    try {
      const batch = await fetchYahooSparkBatch(chunk)
      if (!pricesOnly) {
        const equities = new Map(
          [...batch.entries()].filter(([sym]) => !isOccQuoteSymbol(sym)),
        )
        await enrichQuotesWithMarketCap(equities)
        for (const [sym, q] of equities) batch.set(sym, q)
      }
      for (const [sym, q] of batch) bySymbol.set(sym, q)
    } catch {
      // fall through to per-symbol
    }
  }

  const missing = unique.filter((s) => !bySymbol.has(s))
  if (missing.length > 0) {
    const settled = await Promise.all(
      missing.map(async (symbol) => {
        try {
          if (pricesOnly || isOccQuoteSymbol(symbol)) {
            const yahoo = await fetchYahooChart(symbol)
            if (!yahoo) return null
            return quoteFromFields({
              symbol,
              name: yahoo.name,
              price: yahoo.price,
              currency: yahoo.currency,
              marketCap: null,
              sharesOutstanding: null,
              instrumentType: yahoo.instrumentType,
            })
          }
          return await fetchQuoteFallback(symbol)
        } catch {
          return null
        }
      }),
    )
    for (const q of settled) {
      if (q) bySymbol.set(q.symbol, q)
    }
  }

  return unique.map((s) => bySymbol.get(s)).filter((q): q is Quote => q != null)
}

export async function fetchQuote(rawSymbol: string): Promise<Quote> {
  const symbol = normalizeSymbol(rawSymbol)
  if (!symbol) throw new Error('Invalid ticker symbol')

  if (isOccQuoteSymbol(symbol)) {
    const yahoo = await fetchYahooChart(symbol)
    if (!yahoo) throw new Error(`No data for symbol ${symbol}`)
    return quoteFromFields({
      symbol,
      name: yahoo.name,
      price: yahoo.price,
      currency: yahoo.currency,
      marketCap: null,
      sharesOutstanding: null,
      instrumentType: 'OPTION',
    })
  }

  // Prefer full single-symbol path (price + mcap) for interactive loads.
  const full = await fetchQuoteFallback(symbol)
  if (full) return full

  const [q] = await fetchQuotes([symbol])
  if (!q) throw new Error(`No data for symbol ${symbol}`)
  return q
}
