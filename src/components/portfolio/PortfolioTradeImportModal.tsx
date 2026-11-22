import { useCallback, useMemo, useState } from 'react'
import type { SavedPortfolio } from '../../types'
import {
  appendPortfolioTrades,
  buildTradeImportPreview,
  parseTradeImportText,
  type TradeDuplicatePolicy,
  type TradeImportPreview,
} from '../../lib/portfolioTradesImport'
import { tradesForPortfolio } from '../../lib/portfolioTrades'
import type { PortfolioTradesState } from '../../types'

type Props = {
  open: boolean
  portfolio: SavedPortfolio
  tradesState: PortfolioTradesState
  onClose: () => void
  onApply: (next: PortfolioTradesState) => boolean
}

export function PortfolioTradeImportModal({
  open,
  portfolio,
  tradesState,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState('')
  const [duplicatePolicy, setDuplicatePolicy] = useState<TradeDuplicatePolicy>('skip')
  const [parseError, setParseError] = useState<string | null>(null)
  const [formatHint, setFormatHint] = useState<'json' | 'csv'>('json')

  const holdingIds = useMemo(
    () => new Set(portfolio.holdings.map((h) => h.id)),
    [portfolio.holdings],
  )

  const existingTrades = useMemo(
    () => tradesForPortfolio(tradesState, portfolio.id),
    [tradesState, portfolio.id],
  )

  const preview: TradeImportPreview | null = useMemo(() => {
    if (!draft.trim()) return null
    try {
      const rows = parseTradeImportText(draft, formatHint === 'csv' ? 'csv' : 'auto')
      setParseError(null)
      if (rows.length === 0) return null
      return buildTradeImportPreview(rows, portfolio.id, existingTrades, holdingIds)
    } catch {
      setParseError('Could not parse file or paste — check JSON or CSV format.')
      return null
    }
  }, [draft, formatHint, portfolio.id, existingTrades, holdingIds])

  const resetAndClose = useCallback(() => {
    setDraft('')
    setParseError(null)
    onClose()
  }, [onClose])

  if (!open) return null

  const handleFile = (file: File | null) => {
    if (!file) return
    const isCsv = file.name.toLowerCase().endsWith('.csv')
    setFormatHint(isCsv ? 'csv' : 'json')
    const reader = new FileReader()
    reader.onload = () => {
      setDraft(String(reader.result ?? ''))
      setParseError(null)
    }
    reader.readAsText(file)
  }

  const handleImport = () => {
    if (!preview || preview.valid.length === 0) return
    const { state, imported } = appendPortfolioTrades(
      tradesState,
      preview,
      portfolio.id,
      duplicatePolicy,
    )
    if (imported === 0) return
    if (onApply(state)) resetAndClose()
  }

  const dupCount =
    preview == null
      ? 0
      : preview.valid.filter(
          (r) => r.duplicateOfExisting || r.duplicateOfFileIndex != null,
        ).length

  const importableCount =
    preview == null
      ? 0
      : duplicatePolicy === 'import'
        ? preview.valid.length
        : preview.valid.filter(
            (r) => !r.duplicateOfExisting && r.duplicateOfFileIndex == null,
          ).length

  return (
    <div
      className="fixed inset-0 z-[56] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={resetAndClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-[#121820] shadow-2xl"
        role="dialog"
        aria-label="Import"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Import</h3>
          <button
            type="button"
            className="text-sm text-white/50 hover:text-white"
            onClick={resetAndClose}
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
          <p className="text-xs text-white/50">
            Append to <span className="text-white/80">{portfolio.name}</span>. JSON{' '}
            <code className="text-emerald-300/80">trades[]</code> or CSV with headers{' '}
            <code className="text-emerald-300/80">symbol,side,tradeDate,shares,price</code>.
          </p>
          <textarea
            className="input min-h-[8rem] font-mono text-xs"
            placeholder='[{"symbol":"AAPL","side":"buy","tradeDate":"2024-01-10","shares":10,"price":185}]'
            value={draft}
            onChange={(e) => {
              const v = e.target.value
              setDraft(v)
              if (/^symbol\s*,/i.test(v.trim())) setFormatHint('csv')
              setParseError(null)
            }}
          />
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-sky-200/90">
            <input
              type="file"
              accept=".json,.csv,application/json,text/csv"
              className="text-xs text-white/60"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            Upload .json or .csv
          </label>
          {parseError ? (
            <p className="text-xs text-red-300">{parseError}</p>
          ) : preview ? (
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
              <p className="text-white/75">
                <span className="text-emerald-300/90">{preview.valid.length}</span> valid ·{' '}
                <span className="text-red-300/90">{preview.invalid.length}</span> invalid
                {preview.reassignedCount > 0
                  ? ` · ${preview.reassignedCount} reassigned to this book`
                  : ''}
                {dupCount > 0 ? ` · ${dupCount} duplicate${dupCount === 1 ? '' : 's'}` : ''}
              </p>
              {preview.invalid.length > 0 ? (
                <ul className="max-h-24 list-disc overflow-y-auto pl-4 text-red-300/85">
                  {preview.invalid.slice(0, 12).map((r) => (
                    <li key={r.index}>
                      Row {r.index}: {r.reason}
                    </li>
                  ))}
                  {preview.invalid.length > 12 ? (
                    <li>…and {preview.invalid.length - 12} more</li>
                  ) : null}
                </ul>
              ) : null}
              {dupCount > 0 ? (
                <fieldset className="space-y-1">
                  <legend className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                    Duplicates (same symbol, side, date, shares, price)
                  </legend>
                  <label className="flex items-center gap-2 text-white/70">
                    <input
                      type="radio"
                      name="dup"
                      checked={duplicatePolicy === 'skip'}
                      onChange={() => setDuplicatePolicy('skip')}
                    />
                    Skip duplicates (default)
                  </label>
                  <label className="flex items-center gap-2 text-white/70">
                    <input
                      type="radio"
                      name="dup"
                      checked={duplicatePolicy === 'import'}
                      onChange={() => setDuplicatePolicy('import')}
                    />
                    Import anyway
                  </label>
                </fieldset>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 border-t border-white/10 px-4 py-3">
          <button type="button" className="btn-ghost flex-1" onClick={resetAndClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!preview || importableCount === 0}
            onClick={handleImport}
          >
            Import
          </button>
        </div>
      </div>
    </div>
  )
}