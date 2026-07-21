export type FxQuote = {
  from: string
  to: string
  rate: number
  asOf: string
}

type FrankfurterResponse = {
  amount?: number
  base?: string
  date?: string
  rates?: Record<string, number>
}

/**
 * Live FX via Frankfurter (ECB reference rates, no API key).
 * https://www.frankfurter.app/
 */
export async function fetchFxRate(from: string, to: string): Promise<FxQuote> {
  const base = from.trim().toUpperCase()
  const quote = to.trim().toUpperCase()
  if (!base || !quote) throw new Error('Missing currency codes')
  if (base === quote) {
    return { from: base, to: quote, rate: 1, asOf: new Date().toISOString().slice(0, 10) }
  }

  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`FX request failed (${res.status})`)
  }
  const data = (await res.json()) as FrankfurterResponse
  const rate = data.rates?.[quote]
  if (rate == null || !Number.isFinite(rate) || rate <= 0) {
    throw new Error(`No rate for ${base}/${quote}`)
  }
  return {
    from: base,
    to: quote,
    rate,
    asOf: data.date ?? new Date().toISOString().slice(0, 10),
  }
}
