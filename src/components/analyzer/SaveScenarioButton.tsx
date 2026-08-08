import { useState } from 'react'
import type { EasyProjection, Quote, SavedScenario, YearProjection } from '../../types'

type SaveInput = Omit<SavedScenario, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

type Props = {
  quote: Quote | null
  mcapOverride: number | null
  easyRows: EasyProjection[]
  advancedRows: YearProjection[]
  onSave: (
    input: SaveInput,
  ) => { scenario: SavedScenario; overwritten: boolean } | { error: string }
  /** Button label (default Save scenario) */
  buttonLabel?: string
  /** Prefill scenario name in the dialog */
  defaultName?: string
}

export function SaveScenarioButton({
  quote,
  mcapOverride,
  easyRows,
  advancedRows,
  onSave,
  buttonLabel = 'Save scenario',
  defaultName = 'Base',
}: Props) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const canSave = Boolean(quote?.symbol)

  function handleOpen() {
    setName(defaultName)
    setMessage(null)
    setError(null)
    setOpen(true)
  }

  function handleSave() {
    if (!quote) return
    const trimmed = name.trim() || 'Base'
    const result = onSave({
      symbol: quote.symbol,
      name: trimmed,
      companyName: quote.name,
      currency: quote.currency,
      currentPrice: quote.price,
      currentMarketCap: quote.marketCap,
      sharesOutstanding: quote.sharesOutstanding,
      mcapOverride,
      easyRows,
      advancedRows,
    })
    if ('error' in result) {
      setError(result.error)
      setMessage(null)
      return
    }
    setError(null)
    setMessage(
      result.overwritten
        ? `Updated ${result.scenario.symbol} · ${result.scenario.name}`
        : `Saved ${result.scenario.symbol} · ${result.scenario.name}`,
    )
    setTimeout(() => {
      setOpen(false)
      setMessage(null)
    }, 900)
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="btn-primary"
        disabled={!canSave}
        onClick={handleOpen}
        title={canSave ? 'Save Easy + Advanced assumptions for this ticker' : 'Fetch a ticker first'}
      >
        {buttonLabel}
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-xl border border-white/10 bg-[#121820] p-4 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
            Save projection
          </p>
          <p className="mt-1 text-sm text-white/70">
            {quote ? (
              <>
                <span className="font-semibold text-white">{quote.symbol}</span>
                <span className="text-white/40"> — both Easy and Advanced</span>
              </>
            ) : (
              'No ticker'
            )}
          </p>
          <label className="label mt-3">Scenario name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Base"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave()
              if (e.key === 'Escape') setOpen(false)
            }}
          />
          <p className="mt-1 text-[11px] text-white/35">
            Same name under this ticker overwrites the existing scenario.
          </p>
          {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
          {message && <p className="mt-2 text-xs text-emerald-300">{message}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="btn-ghost !py-1.5" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary !py-1.5" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
