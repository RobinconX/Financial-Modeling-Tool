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
  // Nasdaq public API covers many US-listed equities/ETFs without an API key.
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

export async function fetchQuote(rawSymbol: string): Promise<Quote> {
  const symbol = rawSymbol.trim().toUpperCase()
  if (!symbol || !/^[A-Z0-9.^=_-]{1,15}$/.test(symbol)) {
    throw new Error('Invalid ticker symbol')
  }

  const [yahoo, nasdaq] = await Promise.all([
    fetchYahooChart(symbol),
    fetchNasdaqMarketCap(symbol),
  ])

  const price = yahoo?.price ?? nasdaq.price
  if (price == null) {
    throw new Error(`No data for symbol ${symbol}`)
  }

  const name = yahoo?.name ?? nasdaq.name ?? symbol
  const currency = yahoo?.currency ?? 'USD'
  const marketCap = nasdaq.marketCap
  const sharesOutstanding =
    marketCap != null && price > 0 ? marketCap / price : null

  return {
    symbol,
    name,
    price,
    currency,
    marketCap,
    sharesOutstanding,
  }
}
