import { useState, type FormEvent } from 'react'
import { formatMoney, formatPrice } from '../lib/format'
import type { Quote } from '../types'

type Props = {
  quote: Quote | null
  loading: boolean
  error: string | null
  onFetch: (symbol: string) => void
}

export function TickerSearch({ quote, loading, error, onFetch }: Props) {
  const [symbol, setSymbol] = useState(quote?.symbol ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (symbol.trim()) onFetch(symbol.trim())
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          className="input flex-1 uppercase tracking-wide"
          placeholder="Ticker (e.g. AAPL)"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="btn-primary shrink-0 px-4" disabled={loading || !symbol.trim()}>
          {loading ? '…' : 'Fetch'}
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {quote && !error && (
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-4">
          <Metric label="Name" value={quote.name} wide />
          <Metric label="Price" value={formatPrice(quote.price, quote.currency)} />
          <Metric
            label="Market cap"
            value={formatMoney(quote.marketCap, quote.currency)}
          />
          <Metric label="Symbol" value={quote.symbol} />
        </div>
      )}
    </div>
  )
}

function Metric({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 sm:col-span-1' : undefined}>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="truncate text-sm font-medium text-white/90" title={value}>
        {value}
      </div>
    </div>
  )
}
