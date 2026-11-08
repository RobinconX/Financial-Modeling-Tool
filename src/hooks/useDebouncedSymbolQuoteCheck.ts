import { useEffect, useRef, useState } from 'react'
import {
  lookupSymbolQuote,
  quoteMissingDataWarning,
  type SymbolQuoteLookup,
} from '../lib/quoteValidation'

const DEFAULT_MS = 400

export type SymbolQuoteCheckState = {
  loading: boolean
  noData: boolean
  warning: string | null
  error: string | null
}

/**
 * Debounced live quote check for a symbol field. Skips work when `enabled` is false or symbol empty.
 */
export function useDebouncedSymbolQuoteCheck(
  symbol: string | null | undefined,
  options?: { enabled?: boolean; debounceMs?: number },
): SymbolQuoteCheckState {
  const enabled = options?.enabled !== false
  const debounceMs = options?.debounceMs ?? DEFAULT_MS
  const [loading, setLoading] = useState(false)
  const [noData, setNoData] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      setNoData(false)
      setError(null)
      return
    }
    const trimmed = symbol?.trim() ?? ''
    if (!trimmed) {
      setLoading(false)
      setNoData(false)
      setError(null)
      return
    }

    setLoading(true)
    setNoData(false)
    setError(null)

    const id = ++requestId.current
    const timer = window.setTimeout(() => {
      void (async () => {
        const result: SymbolQuoteLookup = await lookupSymbolQuote(trimmed)
        if (id !== requestId.current) return
        if (result.status === 'ok') {
          setNoData(false)
          setError(null)
        } else if (result.status === 'no_data') {
          setNoData(true)
          setError(null)
        } else {
          setNoData(false)
          setError(result.message)
        }
        setLoading(false)
      })()
    }, debounceMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [symbol, enabled, debounceMs])

  const warning =
    noData && symbol?.trim() ? quoteMissingDataWarning(symbol) : null

  return { loading, noData, warning, error }
}
