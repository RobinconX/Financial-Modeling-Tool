import type { EasyProjection } from '../types'
import {
  buildEasyProjections,
  newEasyProjection,
  sortEasyProjections,
} from '../lib/valuation'
import {
  cleanMoneyAmount,
  formatMoney,
  formatPercent,
  formatPrice,
  parseMoney,
} from '../lib/format'
import { formatInputNumber } from './MoneyInput'
import { impliedSharePrice, marketCapFromSharePrice } from '../lib/sharePrice'

type Props = {
  rows: EasyProjection[]
  onChange: (rows: EasyProjection[]) => void
  currentMarketCap: number | null
  sharesOutstanding: number | null
  currency?: string
}

export function EasyAssumptionsTable({
  rows,
  onChange,
  currentMarketCap,
  sharesOutstanding,
  currency: _currency = 'USD',
}: Props) {
  void _currency // Projection tables always display/store USD
  const currentYear = new Date().getFullYear()
  const sorted = sortEasyProjections(rows)
  const projections =
    currentMarketCap != null && currentMarketCap > 0
      ? buildEasyProjections(currentMarketCap, rows, currentYear)
      : []

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

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          Easy · mcap / share price
        </h3>
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={add}>
          + Year
        </button>
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
              const sharePx = impliedSharePrice(proj?.equityValue, sharesOutstanding)
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
                      onChange={(px) => {
                        if (px == null) {
                          update(row.id, { projectedMarketCap: null })
                          return
                        }
                        const mcap = marketCapFromSharePrice(px, sharesOutstanding)
                        if (mcap != null) update(row.id, { projectedMarketCap: mcap })
                      }}
                      currency="USD"
                      formatAsPrice
                      disabled={sharesOutstanding == null}
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
      {sharesOutstanding == null && (
        <p className="text-[11px] text-white/35">
          Share price needs shares outstanding — use Refresh quote on this scenario.
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
