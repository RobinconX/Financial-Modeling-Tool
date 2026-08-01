import type { EasyProjection } from '../../types'
import {
  buildEasyProjections,
  easyCagrGapYears,
  materializeEasyCagrYears,
  newEasyProjection,
  sortEasyProjections,
} from '../../lib/valuation'
import {
  cleanMoneyAmount,
  formatMoney,
  formatPercent,
  formatPrice,
  parseMoney,
} from '../../lib/format'
import { formatInputNumber } from '../common/MoneyInput'
import {
  impliedSharePrice,
  marketCapFromSharePrice,
  resolveSharesOutstanding,
} from '../../lib/sharePrice'

type Props = {
  rows: EasyProjection[]
  onChange: (rows: EasyProjection[]) => void
  currentMarketCap: number | null
  sharesOutstanding: number | null
  /** Live quote price — used to derive shares when sharesOutstanding is missing */
  currentPrice?: number | null
  /** Raw quote mcap (before override) — optional; falls back to currentMarketCap */
  quoteMarketCap?: number | null
  currency?: string
}

export function EasyAssumptionsTable({
  rows,
  onChange,
  currentMarketCap,
  sharesOutstanding,
  currentPrice = null,
  quoteMarketCap = null,
  currency: _currency = 'USD',
}: Props) {
  void _currency // Projection tables always display/store USD
  const currentYear = new Date().getFullYear()
  const sorted = sortEasyProjections(rows)
  const projections =
    currentMarketCap != null && currentMarketCap > 0
      ? buildEasyProjections(currentMarketCap, rows, currentYear)
      : []

  // Same as Analyzer: explicit shares, else mcap ÷ price (override or quote mcap)
  const shares = resolveSharesOutstanding({
    sharesOutstanding,
    marketCap: quoteMarketCap ?? currentMarketCap,
    price: currentPrice,
    mcapOverride: null,
  })
  // If still missing, try effective currentMarketCap (includes override) ÷ price
  const effectiveShares =
    shares ??
    resolveSharesOutstanding({
      sharesOutstanding: null,
      marketCap: currentMarketCap,
      price: currentPrice,
    })
  const canEditSharePrice = effectiveShares != null && effectiveShares > 0

  function commit(next: EasyProjection[]) {
    onChange(sortEasyProjections(next))
  }

  function update(id: string, patch: Partial<EasyProjection>) {
    commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function remove(id: string) {
    if (rows.length <= 1) {
      commit([newEasyProjection()])
      return
    }
    commit(rows.filter((r) => r.id !== id))
  }

  function add() {
    const last = sorted.length ? sorted[sorted.length - 1] : null
    commit([...rows, newEasyProjection(last ? last.year + 1 : currentYear + 5)])
  }

  const cagrGaps = easyCagrGapYears(rows)

  function fillIntermediateYears() {
    if (cagrGaps.length === 0) return
    commit(materializeEasyCagrYears(rows))
  }

  function setSharePrice(id: string, px: number | null) {
    if (px == null) {
      update(id, { projectedMarketCap: null })
      return
    }
    const mcap = marketCapFromSharePrice(px, effectiveShares)
    if (mcap != null) update(id, { projectedMarketCap: mcap })
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          Easy · mcap / share price
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={fillIntermediateYears}
            disabled={cagrGaps.length === 0}
            title={
              cagrGaps.length === 0
                ? 'Need at least two years with market cap and a gap between them'
                : `Create ${cagrGaps.length} intermediate year${cagrGaps.length === 1 ? '' : 's'} via implied CAGR`
            }
          >
            {cagrGaps.length === 0
              ? 'Fill intermediates (CAGR)'
              : `Fill ${cagrGaps.length} intermediate${cagrGaps.length === 1 ? '' : 's'} (CAGR)`}
          </button>
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={add}>
            + Year
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/45">
            <tr>
              <th className="px-2 py-2 font-medium">Year</th>
              <th className="px-2 py-2 font-medium">Projected mcap</th>
              <th className="px-2 py-2 font-medium">Share price</th>
              <th className="px-2 py-2 font-medium">Total</th>
              <th className="px-2 py-2 font-medium">ROI p.a.</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const proj = projections.find((p) => p.year === row.year)
              // Use stored mcap directly so share price shows even without current mcap / ROI
              const sharePx = impliedSharePrice(row.projectedMarketCap, effectiveShares)
              return (
                <tr key={row.id} className="border-t border-white/5">
                  <td className="px-2 py-1.5">
                    <input
                      className="input !py-1.5 tabular-nums"
                      type="number"
                      min={currentYear + 1}
                      step={1}
                      value={row.year}
                      onChange={(e) =>
                        update(row.id, {
                          year: Number(e.target.value) || currentYear + 5,
                        })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <MoneyCell
                      cellKey={`${row.id}-mcap`}
                      value={row.projectedMarketCap}
                      onChange={(projectedMarketCap) => update(row.id, { projectedMarketCap })}
                      currency="USD"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <MoneyCell
                      cellKey={`${row.id}-px`}
                      value={sharePx}
                      onChange={(px) => setSharePrice(row.id, px)}
                      currency="USD"
                      formatAsPrice
                      disabled={!canEditSharePrice}
                    />
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {proj ? formatPercent(proj.totalReturn) : '—'}
                  </td>
                  <td
                    className={`px-2 py-1.5 font-semibold tabular-nums ${
                      proj && proj.cagr >= 0
                        ? 'text-emerald-400'
                        : proj
                          ? 'text-red-400'
                          : 'text-white/40'
                    }`}
                  >
                    {proj ? formatPercent(proj.cagr) : '—'}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <button
                      type="button"
                      className="text-xs text-white/35 hover:text-red-300"
                      onClick={() => remove(row.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!canEditSharePrice && (
        <p className="text-[11px] text-amber-200/80">
          Share price needs shares outstanding (or live price + market cap so shares ≈ mcap ÷
          price). Use Refresh quote, or set price and market cap / override.
        </p>
      )}
    </div>
  )
}

function MoneyCell({
  value,
  onChange,
  currency = 'USD',
  formatAsPrice,
  disabled,
  cellKey,
}: {
  value: number | null
  onChange: (v: number | null) => void
  currency?: string
  formatAsPrice?: boolean
  disabled?: boolean
  /** Stable key so float noise does not remount mid-edit */
  cellKey: string
}) {
  const clean = cleanMoneyAmount(value)
  const display =
    clean == null ? '' : formatAsPrice ? formatInputNumber(clean, 6) : formatInputNumber(clean, 2)
  return (
    <div>
      <input
        className="input !py-1.5"
        type="text"
        inputMode="decimal"
        disabled={disabled}
        placeholder={formatAsPrice ? 'e.g. 450' : 'e.g. 5T'}
        defaultValue={display}
        key={`${cellKey}:${display}`}
        onBlur={(e) => {
          const raw = e.target.value.trim()
          if (!raw) {
            onChange(null)
            return
          }
          const parsed = parseMoney(raw)
          onChange(cleanMoneyAmount(parsed))
        }}
      />
      {clean != null && (
        <div className="mt-0.5 text-[10px] text-white/35">
          {formatAsPrice ? formatPrice(clean, currency) : formatMoney(clean, currency)}
        </div>
      )}
    </div>
  )
}
