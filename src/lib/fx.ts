import type { DisplayCurrency } from '../types'
import { apiUrl } from './apiBase'
import { fetchFxRate } from '../../server/fx'

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

const FX_CACHE_MS = 5 * 60 * 1000
const fxInflight = new Map<string, Promise<FxQuote>>()
const fxCache = new Map<string, { quote: FxQuote; at: number }>()

function fxPairKey(from: string, to: string): string {
  return `${from.trim().toUpperCase()}-${to.trim().toUpperCase()}`
}

function fetchedAsOf(quote: FxQuote): FxQuote {
  return { ...quote, asOf: new Date().toISOString().slice(0, 10) }
}

async function requestFxRate(from: string, to: string): Promise<FxQuote> {
  const path = `/api/fx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
  try {
    const res = await fetch(apiUrl(path))
    if (res.ok) {
      const data = (await res.json()) as FxQuote & { error?: string }
      if (Number.isFinite(data.rate) && data.rate > 0) return fetchedAsOf(data)
    }
  } catch {
    /* try direct */
  }
  return fetchedAsOf(await fetchFxRateDirect(from, to))
}

/**
 * Prefer same-origin / worker proxy (Yahoo live pair, ECB fallback).
 * Direct browser fallback uses the same fetch so GitHub Pages still works.
 * Concurrent callers share one in-flight request; a short cache avoids a
 * second fetch when Overview / History / StrictMode remount.
 */
export async function fetchFxRateClient(
  from = 'USD',
  to = 'CHF',
): Promise<FxQuote> {
  const key = fxPairKey(from, to)
  const cached = fxCache.get(key)
  if (cached && Date.now() - cached.at < FX_CACHE_MS) return fetchedAsOf(cached.quote)

  const pending = fxInflight.get(key)
  if (pending) return pending

  const req = requestFxRate(from, to)
    .then((quote) => {
      fxCache.set(key, { quote, at: Date.now() })
      return quote
    })
    .finally(() => {
      fxInflight.delete(key)
    })
  fxInflight.set(key, req)
  return req
}

async function fetchFxRateDirect(from: string, to: string): Promise<FxQuote> {
  return fetchFxRate(from, to)
}
