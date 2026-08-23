export type FxQuote = {
  from: string
  to: string
  rate: number
  asOf: string
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number
        regularMarketTime?: number
        previousClose?: number
        chartPreviousClose?: number
      }
    }>
  }
}

type FrankfurterResponse = {
  date?: string
  rates?: Record<string, number>
}

const YAHOO_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Live FX via Yahoo (`USDCHF=X`), same market last as stock quotes.
 * Frankfurter/ECB is a daily official fix (~16:00 CET, no weekends) and is
 * only used if Yahoo is unavailable.
 */
export async function fetchFxRate(from: string, to: string): Promise<FxQuote> {
  const base = from.trim().toUpperCase()
  const quote = to.trim().toUpperCase()
  if (!base || !quote) throw new Error('Missing currency codes')
  if (base === quote) {
    return { from: base, to: quote, rate: 1, asOf: todayUtc() }
  }

  const live = await fetchYahooFx(base, quote)
  if (live) return live

  const inverse = await fetchYahooFx(quote, base)
  if (inverse) {
    return {
      from: base,
      to: quote,
      rate: 1 / inverse.rate,
      asOf: inverse.asOf,
    }
  }

  return fetchFrankfurterFx(base, quote)
}

async function fetchYahooFx(from: string, to: string): Promise<FxQuote | null> {
  const symbol = `${from}${to}=X`
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`
  try {
    const res = await fetch(url, { headers: YAHOO_HEADERS })
    if (!res.ok) return null
    const data = (await res.json()) as YahooChartResponse
    const meta = data.chart?.result?.[0]?.meta
    const price =
      meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? meta?.previousClose ?? null
    if (price == null || !Number.isFinite(price) || price <= 0) return null
    // Live last — date is when we fetched, not Yahoo's last session
    // (range=1d is the last FX weekday; weekends still show Friday).
    return {
      from,
      to,
      rate: price,
      asOf: todayUtc(),
    }
  } catch {
    return null
  }
}

async function fetchFrankfurterFx(from: string, to: string): Promise<FxQuote> {
  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`FX request failed (${res.status})`)
  }
  const data = (await res.json()) as FrankfurterResponse
  const rate = data.rates?.[to]
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No rate for ${from}/${to}`)
  }
  return {
    from,
    to,
    rate,
    asOf: data.date ?? new Date().toISOString().slice(0, 10),
  }
}
