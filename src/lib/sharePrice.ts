import { usesUnitLabel } from './instrumentType'

/** Round to avoid float noise from mcap ↔ price conversions. */
function cleanPrice(n: number): number {
  // 6 decimal places is more than enough for share prices
  return Math.round(n * 1e6) / 1e6
}

/** Projected share price from equity-value (post-dilution) and current shares. */
export function impliedSharePrice(
  equityValue: number | null | undefined,
  sharesOutstanding: number | null | undefined,
): number | null {
  if (
    equityValue == null ||
    !Number.isFinite(equityValue) ||
    equityValue <= 0 ||
    sharesOutstanding == null ||
    !Number.isFinite(sharesOutstanding) ||
    sharesOutstanding <= 0
  ) {
    return null
  }
  return cleanPrice(equityValue / sharesOutstanding)
}

export function marketCapFromSharePrice(
  sharePrice: number | null | undefined,
  sharesOutstanding: number | null | undefined,
): number | null {
  if (
    sharePrice == null ||
    !Number.isFinite(sharePrice) ||
    sharePrice <= 0 ||
    sharesOutstanding == null ||
    !Number.isFinite(sharesOutstanding) ||
    sharesOutstanding <= 0
  ) {
    return null
  }
  // Whole dollars — avoids float noise written back into projection mcap fields
  return Math.round(sharePrice * sharesOutstanding)
}

export function effectiveMarketCap(
  mcapOverride: number | null | undefined,
  currentMarketCap: number | null | undefined,
): number | null {
  if (mcapOverride != null && mcapOverride > 0) return mcapOverride
  if (currentMarketCap != null && currentMarketCap > 0) return currentMarketCap
  return null
}

/**
 * Live baseline mcap for valuation: override → quote mcap → synthetic (1 unit × price) for funds/indexes.
 */
export function baselineMarketCap(opts: {
  mcapOverride?: number | null
  marketCap?: number | null
  price?: number | null
  instrumentType?: string | null
  symbol?: string | null
}): number | null {
  const direct = effectiveMarketCap(opts.mcapOverride ?? null, opts.marketCap ?? null)
  if (direct != null) return direct
  const price = opts.price
  if (price != null && price > 0 && usesUnitLabel(opts.instrumentType, opts.symbol)) {
    return price
  }
  return null
}

/**
 * Resolve shares outstanding from quote fields and optional mcap override.
 * Prefers explicit shares; else mcap / price; else 1 synthetic unit for tradable funds/indexes.
 */
export function resolveSharesOutstanding(opts: {
  sharesOutstanding?: number | null
  marketCap?: number | null
  price?: number | null
  mcapOverride?: number | null
  instrumentType?: string | null
  symbol?: string | null
}): number | null {
  if (
    opts.sharesOutstanding != null &&
    Number.isFinite(opts.sharesOutstanding) &&
    opts.sharesOutstanding > 0
  ) {
    return opts.sharesOutstanding
  }
  const mcap = baselineMarketCap(opts)
  const price = opts.price
  if (mcap != null && mcap > 0 && price != null && price > 0) {
    return mcap / price
  }
  if (price != null && price > 0 && usesUnitLabel(opts.instrumentType, opts.symbol)) {
    return 1
  }
  return null
}
