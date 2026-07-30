import type { DisplayCurrency } from '../types'

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

export async function fetchFxRateClient(
  from = 'USD',
  to = 'CHF',
): Promise<FxQuote> {
  const url = `/api/fx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  const res = await fetch(url)
  const data = (await res.json()) as FxQuote & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `FX failed (${res.status})`)
  }
  if (!Number.isFinite(data.rate) || data.rate <= 0) {
    throw new Error('Invalid FX rate')
  }
  return data
}
