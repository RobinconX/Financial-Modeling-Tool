import type { EasyProjection } from '../../types'
import {
  easyCagrGapYears,
  materializeEasyCagrYears,
  newEasyProjection,
  sortEasyProjections,
} from '../../lib/valuation'
import {
  impliedSharePrice,
  marketCapFromSharePrice,
} from '../../lib/sharePrice'
import { MoneyInput, NumberInput } from '../common/MoneyInput'
type Props = {
  rows: EasyProjection[]
  onChange: (rows: EasyProjection[]) => void
  currency?: string
  currentMarketCap?: number | null
  sharesOutstanding?: number | null
  currentPrice?: number | null
}

export function EasyInputs({
  rows,
  onChange,
  currency = 'USD',
  currentMarketCap,
  sharesOutstanding,
}: Props) {
  const currentYear = new Date().getFullYear()
  const sorted = sortEasyProjections(rows)
  const canConvert = sharesOutstanding != null && sharesOutstanding > 0

  function commit(next: EasyProjection[]) {
    onChange(sortEasyProjections(next))
  }

  function updateRow(id: string, patch: Partial<EasyProjection>) {
    commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeRow(id: string) {
    commit(rows.filter((r) => r.id !== id))
  }

  function addRow() {
    const last = sorted.length ? sorted[sorted.length - 1] : null
    const nextYear = last ? last.year + 1 : currentYear + 5
    commit([...rows, newEasyProjection(nextYear, null)])
  }

  const cagrGaps = easyCagrGapYears(rows, currentMarketCap, currentYear)

  function fillIntermediateYears() {
    if (cagrGaps.length === 0) return
    commit(materializeEasyCagrYears(rows, currentMarketCap, currentYear))
  }

  function setSharePrice(id: string, sharePrice: number | null) {
    if (sharePrice == null) {
      updateRow(id, { projectedMarketCap: null })
      return
    }
    const mcap = marketCapFromSharePrice(sharePrice, sharesOutstanding)
    if (mcap != null) {
      updateRow(id, { projectedMarketCap: mcap })
    }
  }

  return (
    <div className="space-y-2">
      {!canConvert && (
        <p className="text-[11px] text-amber-200/80">
          Share price needs shares outstanding (fetch a ticker, or set a mcap override).
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="py-1 text-xs text-white/40">No easy targets yet.</p>
      ) : null}

      {sorted.map((row) => {
        const sharePx = impliedSharePrice(row.projectedMarketCap, sharesOutstanding)
        return (
          <div
            key={row.id}
            className="grid items-end gap-2 sm:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)_auto]"
          >
            <NumberInput
              label="Year"
              value={row.year}
              min={currentYear}
              step="1"
              commitOnBlur
              onChange={(year) =>
                updateRow(row.id, {
                  year:
                    year != null && Number.isFinite(year)
                      ? Math.floor(year)
                      : currentYear + 5,
                })
              }
              placeholder={String(currentYear + 5)}
            />
            <MoneyInput
              label="Market cap"
              value={row.projectedMarketCap}
              onChange={(projectedMarketCap) => updateRow(row.id, { projectedMarketCap })}
              placeholder="e.g. 5T"
              currency={currency}
              hideHint
            />
            <MoneyInput
              label="Share price"
              value={sharePx}
              onChange={(px) => setSharePrice(row.id, px)}
              placeholder="e.g. 450"
              currency={currency}
              disabled={!canConvert}
              commitOnBlur
              displayDecimals={4}
              hideHint
            />
            <button
              type="button"
              className="btn-ghost mb-0.5 !px-2 !py-2 !text-xs text-white/35 hover:text-red-300"
              onClick={() => removeRow(row.id)}
              title="Remove this target"
            >
              ×
            </button>
          </div>
        )
      })}

      <div className="flex flex-wrap gap-2 pt-0.5">
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={addRow}>
          + Year
        </button>
        <button
          type="button"
          className="btn-ghost !py-1 !text-xs"
          onClick={fillIntermediateYears}
          disabled={cagrGaps.length === 0}
          title="Fills missing years using implied CAGR from today / between stated years"
        >
          Fill in years
        </button>
      </div>
    </div>
  )
}
