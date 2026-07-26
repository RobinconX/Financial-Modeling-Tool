/** Parse money strings like "1.2T", "450B", "3,000", "$50M" */
export function parseMoney(input: string): number | null {
  const s = input.trim().toUpperCase().replace(/[$,\s]/g, '')
  if (!s) return null
  const m = s.match(/^(-?[\d.]+)([KMBT])?$/)
  if (!m) return null
  const n = Number(m[1])
  if (!Number.isFinite(n)) return null
  const mult: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 }
  const factor = m[2] ? mult[m[2]] : 1
  const value = n * factor
  // Suffix amounts (K/M/B/T) are whole-unit multiples; keep clean integers
  if (m[2]) return Math.round(value)
  // Bare numbers: if effectively whole dollars, store as integer
  if (Math.abs(value - Math.round(value)) < 1e-6) return Math.round(value)
  return value
}

/** Clean stored money for display / re-save (strip float noise). */
export function cleanMoneyAmount(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  if (Math.abs(value) >= 1) {
    const rounded = Math.round(value)
    // Prefer integer if within 0.01 of a whole dollar
    if (Math.abs(value - rounded) < 0.01) return rounded
    return Math.round(value * 100) / 100
  }
  return value
}

function moneyPrefix(currency: string): string {
  if (currency === 'USD') return '$'
  if (currency === 'CHF') return 'CHF '
  return `${currency} `
}

/** Market caps / large amounts — always 2 digits after the decimal. */
export function formatMoney(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  const symbol = moneyPrefix(currency)

  if (abs >= 1e12) return `${sign}${symbol}${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}${symbol}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${symbol}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${sign}${symbol}${(abs / 1e3).toFixed(2)}K`

  return `${sign}${symbol}${abs.toFixed(2)}`
}

export function formatPrice(value: number | null | undefined, currency = 'USD'): string {
  if (value == null || !Number.isFinite(value)) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: value >= 1000 ? 2 : 4,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

/** Format ratio as percent, e.g. 0.1487 → "14.9%" */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

export function formatMultiple(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return `${value.toFixed(1)}x`
}

export function moneyInputDisplay(value: number | null): string {
  if (value == null) return ''
  return String(value)
}
