import { useDebouncedSymbolQuoteCheck } from '../../hooks/useDebouncedSymbolQuoteCheck'
import { symbolMissingQuoteData, useQuoteHealth } from '../../context/QuoteHealthContext'
import { quoteMissingDataWarning } from '../../lib/quoteValidation'
import { QuoteDataWarning } from './QuoteDataWarning'

type Props = {
  symbol: string
  enabled?: boolean
}

/** Inline warning under a ticker field (live check + background refresh state). */
export function SymbolQuoteFieldHint({ symbol, enabled = true }: Props) {
  const { missingSymbols } = useQuoteHealth()
  const { warning, error, loading } = useDebouncedSymbolQuoteCheck(symbol, {
    enabled,
  })
  const fromRefresh = symbolMissingQuoteData(missingSymbols, symbol)
  const showWarning =
    warning ?? (fromRefresh && !error ? quoteMissingDataWarning(symbol) : null)

  if (!enabled) return null
  if (loading && !showWarning && !error) return null
  if (error) {
    return (
      <p className="mt-1 text-[11px] text-red-300/90" role="status">
        {error}
      </p>
    )
  }
  if (!showWarning) return null
  return <QuoteDataWarning className="!mt-1 !px-2 !py-1.5 !text-[11px]" message={showWarning} />
}
