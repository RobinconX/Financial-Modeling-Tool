import { createContext, useContext, type ReactNode } from 'react'

export type QuoteHealthContextValue = {
  /** Symbols whose last background refresh returned no usable price. */
  missingSymbols: ReadonlySet<string>
}

const QuoteHealthContext = createContext<QuoteHealthContextValue>({
  missingSymbols: new Set(),
})

export function QuoteHealthProvider({
  missingSymbols,
  children,
}: {
  missingSymbols: ReadonlySet<string>
  children: ReactNode
}) {
  return (
    <QuoteHealthContext.Provider value={{ missingSymbols }}>
      {children}
    </QuoteHealthContext.Provider>
  )
}

export function useQuoteHealth(): QuoteHealthContextValue {
  return useContext(QuoteHealthContext)
}

export function symbolMissingQuoteData(
  missingSymbols: ReadonlySet<string>,
  symbol: string | null | undefined,
): boolean {
  const s = symbol?.trim().toUpperCase()
  return Boolean(s && missingSymbols.has(s))
}
