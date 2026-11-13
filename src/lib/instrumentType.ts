/** Yahoo `instrumentType` values we normalize from chart/spark meta. */
export type QuoteInstrumentType = 'EQUITY' | 'ETF' | 'MUTUALFUND' | 'INDEX' | 'OPTION' | string

export function normalizeInstrumentType(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const t = raw.trim().toUpperCase()
  return t.length > 0 ? t : null
}

export function isIndexSymbol(symbol: string | null | undefined): boolean {
  return Boolean(symbol?.trim().startsWith('^'))
}

/** ETFs, funds, and market indexes use per-unit modeling (not issuer share count). */
export function usesUnitLabel(
  instrumentType: string | null | undefined,
  symbol?: string | null,
): boolean {
  const t = instrumentType?.toUpperCase()
  if (t === 'ETF' || t === 'MUTUALFUND' || t === 'INDEX') return true
  if (t === 'OPTION') return false
  return isIndexSymbol(symbol)
}

export function equityShareCountLabel(instrumentType: string | null | undefined, symbol?: string | null): string {
  return usesUnitLabel(instrumentType, symbol) ? 'Units' : 'Shares'
}

export function equityShareCountLabelLower(
  instrumentType: string | null | undefined,
  symbol?: string | null,
): string {
  return usesUnitLabel(instrumentType, symbol) ? 'units' : 'shares'
}

/** Order Nasdaq `assetclass` query tries (etf-first for fund-like symbols). */
export function nasdaqAssetClassOrder(
  instrumentType: string | null | undefined,
  symbol?: string | null,
): ('stocks' | 'etf')[] {
  if (usesUnitLabel(instrumentType, symbol) && !isIndexSymbol(symbol)) {
    return ['etf', 'stocks']
  }
  return ['stocks', 'etf']
}
