export type Quote = {
  symbol: string
  name: string
  price: number
  currency: string
  marketCap: number | null
  sharesOutstanding: number | null
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string
        currency?: string
        regularMarketPrice?: number
        chartPreviousClose?: number
        previousClose?: number
        longName?: string
        shortName?: string
      }
    }>
    error?: { description?: string } | null
  }
}

type YahooQuoteResponse = {
  quoteResponse?: {
    result?: Array<{
      symbol?: string
      longName?: string
      shortName?: string
      regularMarketPrice?: number
      postMarketPrice?: number
      preMarketPrice?: number
      currency?: string
      marketCap?: number
      sharesOutstanding?: number
    }>
    error?: { description?: string } | null
  }
}

type NasdaqSummaryResponse = {
  data?: {
    symbol?: string
    summaryData?: {
      MarketCap?: { value?: string }
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

/** Yahoo batch quote URL length / practical limit. */
const YAHOO_BATCH_SIZE = 40

const SYMBOL_RE = /^[A-Z0-9.^=_-]{1,15}$/

function parseNasdaqMoney(value: string | undefined): number | null {
  if (!value || value === 'N/A') return null
  const cleaned = value.replace(/[$,\s]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
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

function quoteFromYahooFields(fields: {
  symbol: string
  name?: string | null
  price: number
  currency?: string | null
  marketCap?: number | null
  sharesOutstanding?: number | null
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
  }
}

async function fetchYahooChart(symbol: string): Promise<{
  price: number
  name: string
  currency: string
} | null> {
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const chartRes = await fetch(chartUrl, { headers: YAHOO_HEADERS })
  if (!chartRes.ok) return null

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
  }
}

async function fetchNasdaqMarketCap(symbol: string): Promise<{
  marketCap: number | null
  name: string | null
  price: number | null
}> {
  const assetClasses = ['stocks', 'etf'] as const
  for (const assetClass of assetClasses) {
    try {
      const [summaryRes, infoRes] = await Promise.all([
        fetch(
          `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/summary?assetclass=${assetClass}`,
          { headers: YAHOO_HEADERS },
        ),
        fetch(
          `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/info?assetclass=${assetClass}`,
          { headers: YAHOO_HEADERS },
        ),
      ])

      let marketCap: number | null = null
      let name: string | null = null
      let price: number | null = null

      if (summaryRes.ok) {
        const summaryJson = (await summaryRes.json()) as NasdaqSummaryResponse
        marketCap = parseNasdaqMoney(summaryJson.data?.summaryData?.MarketCap?.value)
      }
      if (infoRes.ok) {
        const infoJson = (await infoRes.json()) as NasdaqInfoResponse
        name = infoJson.data?.companyName ?? null
        price = parseNasdaqPrice(infoJson.data?.primaryData?.lastSalePrice)
      }

      if (marketCap != null || price != null || name) {
        return { marketCap, name, price }
      }
    } catch {
      // try next asset class
    }
  }
  return { marketCap: null, name: null, price: null }
}

/**
 * One Yahoo request for many symbols (price, mcap, shares, name).
 * Returns only symbols that had a usable price.
 */
async function fetchYahooQuotesBatch(symbols: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>()
  if (symbols.length === 0) return out

  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols
    .map((s) => encodeURIComponent(s))
    .join(',')}`
  const res = await fetch(url, { headers: YAHOO_HEADERS })
  if (!res.ok) return out

  const json = (await res.json()) as YahooQuoteResponse
  for (const row of json.quoteResponse?.result ?? []) {
    const symbol = row.symbol?.toUpperCase()
    if (!symbol) continue
    const price = row.regularMarketPrice ?? row.postMarketPrice ?? row.preMarketPrice
    if (price == null || !Number.isFinite(price)) continue
    out.set(
      symbol,
      quoteFromYahooFields({
        symbol,
        name: row.longName ?? row.shortName ?? symbol,
        price,
        currency: row.currency,
        marketCap: row.marketCap ?? null,
        sharesOutstanding: row.sharesOutstanding ?? null,
      }),
    )
  }
  return out
}

/** Per-symbol fallback (chart + Nasdaq) when batch misses a ticker. */
async function fetchQuoteFallback(symbol: string): Promise<Quote | null> {
  const [yahoo, nasdaq] = await Promise.all([
    fetchYahooChart(symbol),
    fetchNasdaqMarketCap(symbol),
  ])

  const price = yahoo?.price ?? nasdaq.price
  if (price == null) return null

  return quoteFromYahooFields({
    symbol,
    name: yahoo?.name ?? nasdaq.name ?? symbol,
    price,
    currency: yahoo?.currency ?? 'USD',
    marketCap: nasdaq.marketCap,
    sharesOutstanding: null,
  })
}

/**
 * Fetch quotes for many tickers efficiently:
 * 1. Yahoo batch API (1 request per ~40 symbols)
 * 2. Parallel per-symbol fallback only for misses
 */
export async function fetchQuotes(rawSymbols: string[]): Promise<Quote[]> {
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
      const batch = await fetchYahooQuotesBatch(chunk)
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

  // Preserve request order (unique list order)
  return unique.map((s) => bySymbol.get(s)).filter((q): q is Quote => q != null)
}

export async function fetchQuote(rawSymbol: string): Promise<Quote> {
  const symbol = normalizeSymbol(rawSymbol)
  if (!symbol) throw new Error('Invalid ticker symbol')

  const [q] = await fetchQuotes([symbol])
  if (!q) throw new Error(`No data for symbol ${symbol}`)
  return q
}
