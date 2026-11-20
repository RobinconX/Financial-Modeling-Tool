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

/** Short suffix for compact quantity display (matches Analyze panel). */
export function equityShareCountAbbrev(
  instrumentType: string | null | undefined,
  symbol?: string | null,
): string {
  return usesUnitLabel(instrumentType, symbol) ? 'units' : 'sh'
}

/** Per-unit price suffix in action previews (e.g. USD/sh vs USD/unit). */
export function equityPricePerUnitSuffix(
  instrumentType: string | null | undefined,
  symbol?: string | null,
): string {
  return usesUnitLabel(instrumentType, symbol) ? 'unit' : 'sh'
}

/** Saved-projection instrumentType for a portfolio row: linked scenario, then any save for the symbol. */
export function instrumentTypeForHolding(
  linkedScenario: { instrumentType: string | null } | null | undefined,
  scenariosForSymbol: { instrumentType: string | null }[] = [],
): string | null {
  const linked = normalizeInstrumentType(linkedScenario?.instrumentType ?? null)
  if (linked) return linked
  for (const s of scenariosForSymbol) {
    const t = normalizeInstrumentType(s.instrumentType)
    if (t) return t
  }
  return null
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
