import type { DisplayCurrency } from '../types'
import { apiUrl } from './apiBase'

export type FxQuote = {
  from: string
  to: string
  rate: number
  asOf: string
}

/** Convert a USD book value into the selected display currency. */
export function toDisplay(
  usd: number,
  currency: DisplayCurrency,
  usdToChf: number | null,
): number {
  if (!Number.isFinite(usd)) return usd
  if (currency === 'CHF' && usdToChf != null && usdToChf > 0) return usd * usdToChf
  return usd
}

/** Convert a user-entered display amount back into USD for storage. */
export function fromDisplay(
  amount: number,
  currency: DisplayCurrency,
  usdToChf: number | null,
): number {
  if (!Number.isFinite(amount)) return amount
  if (currency === 'CHF' && usdToChf != null && usdToChf > 0) return amount / usdToChf
  return amount
}

/**
 * Convert a fixed cash amount stored in `amountCurrency` into USD book units.
 * CHF amounts only move with FX when combining with USD stocks — the stored
 * nominal CHF figure itself does not change.
 */
export function fixedAmountToUsd(
  amount: number,
  amountCurrency: DisplayCurrency | null | undefined,
  usdToChf: number | null | undefined,
): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (amountCurrency === 'CHF') {
    if (usdToChf != null && usdToChf > 0) return amount / usdToChf
    return amount
  }
  return amount
}

/**
 * Show a fixed cash amount in the portfolio display currency.
 * When storage denomination matches display currency, return the stored
 * number unchanged (no FX drift).
 */
export function amountToDisplay(
  amount: number,
  amountCurrency: DisplayCurrency | null | undefined,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): number {
  if (!Number.isFinite(amount)) return amount
  const book: DisplayCurrency = amountCurrency === 'CHF' ? 'CHF' : 'USD'
  if (book === displayCurrency) return amount
  const usd = fixedAmountToUsd(amount, book, usdToChf)
  return toDisplay(usd, displayCurrency, usdToChf)
}

/**
 * Prefer same-origin / external proxy; fall back to Frankfurter in the browser
 * (CORS-friendly) so CHF display still works on static GitHub Pages.
 */
export async function fetchFxRateClient(
  from = 'USD',
  to = 'CHF',
): Promise<FxQuote> {
  const path = `/api/fx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  try {
    const res = await fetch(apiUrl(path))
    if (res.ok) {
      const data = (await res.json()) as FxQuote & { error?: string }
      if (Number.isFinite(data.rate) && data.rate > 0) return data
    }
  } catch {
    /* try direct */
  }
  return fetchFxRateDirect(from, to)
}

async function fetchFxRateDirect(from: string, to: string): Promise<FxQuote> {
  const base = from.trim().toUpperCase()
  const quote = to.trim().toUpperCase()
  if (!base || !quote) throw new Error('Missing currency codes')
  if (base === quote) {
    return { from: base, to: quote, rate: 1, asOf: new Date().toISOString().slice(0, 10) }
  }
  const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(base)}&to=${encodeURIComponent(quote)}`
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`FX request failed (${res.status})`)
  const data = (await res.json()) as { date?: string; rates?: Record<string, number> }
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
