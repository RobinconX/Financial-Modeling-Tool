import type { EasyProjection } from '../../types'
import {
  cagr,
  easyCagrGapYears,
  materializeEasyCagrYears,
  newEasyProjection,
  sortEasyProjections,
  totalReturn,
  yearsUntilProjectionEnd,
} from '../../lib/valuation'
import {
  impliedSharePrice,
  marketCapFromSharePrice,
} from '../../lib/sharePrice'
import { MoneyInput, NumberInput } from '../common/MoneyInput'
import { formatMoney, formatPercent, formatPrice } from '../../lib/format'

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
    <div className="space-y-3">
      {!canConvert && (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200/90">
          Share price conversion needs shares outstanding (fetch a ticker with mcap/price, or set a
          market cap override so shares ≈ mcap ÷ price).
        </p>
      )}

      {sorted.length === 0 ? (
        <p className="py-2 text-center text-xs text-white/40">No easy targets yet.</p>
      ) : null}

      {sorted.map((row, index) => {
        const horizon =
          row.projectedMarketCap != null &&
          row.projectedMarketCap > 0 &&
          currentMarketCap != null &&
          currentMarketCap > 0
            ? yearsUntilProjectionEnd(row.year)
            : null
        const rowCagr =
          horizon != null && horizon > 0
            ? cagr(currentMarketCap!, row.projectedMarketCap!, horizon)
            : null
        const rowTotal =
          horizon != null && horizon > 0
            ? totalReturn(currentMarketCap!, row.projectedMarketCap!)
            : null
        const sharePx = impliedSharePrice(row.projectedMarketCap, sharesOutstanding)

        return (
          <div
            key={row.id}
            className="space-y-3 rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h4 className="text-sm font-semibold text-white/85">
                  {row.year || `Year ${index + 1}`}
                </h4>
                <span className="text-xs text-white/40">Projection {index + 1}</span>
                {rowCagr != null && Number.isFinite(rowCagr) && (
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                      rowCagr >= 0
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-red-500/30 bg-red-500/10 text-red-300'
                    }`}
                  >
                    ROI p.a. {formatPercent(rowCagr)}
                    {rowTotal != null && Number.isFinite(rowTotal)
                      ? ` · total ${formatPercent(rowTotal)}`
                      : ''}
                  </span>
                )}
              </div>
              <button
                type="button"
                className="btn-ghost !py-1 !text-xs text-white/45 hover:text-red-300"
                onClick={() => removeRow(row.id)}
                title="Remove this target"
              >
                Remove
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <NumberInput
                label="Target year"
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
                label="Projected market cap (USD)"
                value={row.projectedMarketCap}
                onChange={(projectedMarketCap) => updateRow(row.id, { projectedMarketCap })}
                placeholder="e.g. 5T"
                currency={currency}
                hint={
                  row.projectedMarketCap != null
                    ? `= ${formatMoney(row.projectedMarketCap, 'USD')}`
                    : 'Accepts 5T, 500B, or full numbers — always USD'
                }
              />
              <MoneyInput
                label="Projected share price (USD)"
                value={sharePx}
                onChange={(px) => setSharePrice(row.id, px)}
                placeholder="e.g. 450"
                currency={currency}
                disabled={!canConvert}
                commitOnBlur
                displayDecimals={4}
                hint={
                  canConvert
                    ? sharePx != null
                      ? `= ${formatPrice(sharePx, 'USD')} · mcap = price × shares`
                      : 'Enter price → mcap = price × shares (USD)'
                    : 'Needs shares outstanding'
                }
              />
            </div>
          </div>
        )
      })}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button type="button" className="btn-ghost flex-1" onClick={addRow}>
          + Add year
        </button>
        <button
          type="button"
          className="btn-ghost flex-1"
          onClick={fillIntermediateYears}
          disabled={cagrGaps.length === 0}
          title={
            cagrGaps.length === 0
              ? 'Need a future year with market cap (and today’s mcap, or a second year) with a multi-year gap'
              : `Create ${cagrGaps.length} intermediate year${cagrGaps.length === 1 ? '' : 's'} via implied CAGR from today / between years`
          }
        >
          {cagrGaps.length === 0
            ? 'Fill intermediate years (CAGR)'
            : `Fill ${cagrGaps.length} intermediate year${cagrGaps.length === 1 ? '' : 's'} (CAGR)`}
        </button>
      </div>
    </div>
  )
}
