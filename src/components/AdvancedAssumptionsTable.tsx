import type { YearProjection } from '../types'
import {
  buildAdvancedProjections,
  equityValueAfterDilution,
  impliedFromPE,
  impliedFromPFCF,
  impliedFromPS,
  newYearProjection,
  normalizeDilution,
  sortYearProjections,
} from '../lib/valuation'
import { formatMoney, formatPercent, formatPrice, parseMoney } from '../lib/format'
import { impliedSharePrice } from '../lib/sharePrice'

type Props = {
  rows: YearProjection[]
  onChange: (rows: YearProjection[]) => void
  currentMarketCap: number | null
  sharesOutstanding: number | null
  currency?: string
}

export function AdvancedAssumptionsTable({
  rows,
  onChange,
  currentMarketCap,
  sharesOutstanding,
  currency = 'USD',
}: Props) {
  const currentYear = new Date().getFullYear()
  const sorted = sortYearProjections(rows)
  const projections =
    currentMarketCap != null && currentMarketCap > 0
      ? buildAdvancedProjections(currentMarketCap, rows, currentYear)
      : []

  function commit(next: YearProjection[]) {
    onChange(sortYearProjections(next))
  }

  function update(id: string, patch: Partial<YearProjection>) {
    commit(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function remove(id: string) {
    if (rows.length <= 1) {
      commit([newYearProjection()])
      return
    }
    commit(rows.filter((r) => r.id !== id))
  }

  function add() {
    const last = sorted.length ? sorted[sorted.length - 1] : null
    commit([
      ...rows,
      newYearProjection(last ? last.year + 1 : currentYear + 5, last?.dilutionFactor ?? 1),
    ])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
          Advanced · P/S · P/FCF · P/E
        </h3>
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={add}>
          + Year
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/45">
            <tr>
              <th className="sticky left-0 z-10 bg-[#141a22] px-2 py-2 font-medium">Year</th>
              <th className="px-2 py-2 font-medium">Dilution</th>
              <th className="px-2 py-2 font-medium text-sky-300/80">Revenue</th>
              <th className="px-2 py-2 font-medium text-sky-300/80">P/S</th>
              <th className="px-2 py-2 font-medium text-sky-300/80">P/S mcap</th>
              <th className="px-2 py-2 font-medium text-sky-300/80">P/S px</th>
              <th className="px-2 py-2 font-medium text-sky-300/80">ROI</th>
              <th className="px-2 py-2 font-medium text-violet-300/80">FCF</th>
              <th className="px-2 py-2 font-medium text-violet-300/80">P/FCF</th>
              <th className="px-2 py-2 font-medium text-violet-300/80">mcap</th>
              <th className="px-2 py-2 font-medium text-violet-300/80">px</th>
              <th className="px-2 py-2 font-medium text-violet-300/80">ROI</th>
              <th className="px-2 py-2 font-medium text-amber-300/80">Profit</th>
              <th className="px-2 py-2 font-medium text-amber-300/80">P/E</th>
              <th className="px-2 py-2 font-medium text-amber-300/80">mcap</th>
              <th className="px-2 py-2 font-medium text-amber-300/80">px</th>
              <th className="px-2 py-2 font-medium text-amber-300/80">ROI</th>
              <th className="px-2 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const dil = normalizeDilution(row.dilutionFactor)
              const psMcap =
                row.revenue != null && row.psMultiple != null
                  ? impliedFromPS(row.revenue, row.psMultiple)
                  : null
              const pfcfMcap =
                row.fcf != null && row.pfcfMultiple != null
                  ? impliedFromPFCF(row.fcf, row.pfcfMultiple)
                  : null
              const peMcap =
                row.profit != null && row.peMultiple != null
                  ? impliedFromPE(row.profit, row.peMultiple)
                  : null

              const psEq = psMcap != null ? equityValueAfterDilution(psMcap, dil) : null
              const pfcfEq = pfcfMcap != null ? equityValueAfterDilution(pfcfMcap, dil) : null
              const peEq = peMcap != null ? equityValueAfterDilution(peMcap, dil) : null

              const psProj = projections.find((p) => p.year === row.year && p.basis === 'ps')
              const pfcfProj = projections.find((p) => p.year === row.year && p.basis === 'pfcf')
              const peProj = projections.find((p) => p.year === row.year && p.basis === 'pe')

              return (
                <tr key={row.id} className="border-t border-white/5 align-top">
                  <td className="sticky left-0 z-10 bg-[#0f141b] px-2 py-1.5">
                    <input
                      className="input !w-20 !py-1 tabular-nums"
                      type="number"
                      min={currentYear + 1}
                      value={row.year}
                      onChange={(e) =>
                        update(row.id, { year: Number(e.target.value) || currentYear + 5 })
                      }
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      className="input !w-16 !py-1 tabular-nums"
                      type="number"
                      min={0.0001}
                      step={0.01}
                      value={row.dilutionFactor}
                      onChange={(e) => {
                        const n = Number(e.target.value)
                        update(row.id, { dilutionFactor: n > 0 ? n : 1 })
                      }}
                    />
                  </td>
                  <MoneyTd
                    value={row.revenue}
                    onChange={(revenue) => update(row.id, { revenue })}
                    currency={currency}
                  />
                  <NumTd
                    value={row.psMultiple}
                    onChange={(psMultiple) => update(row.id, { psMultiple })}
                  />
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatMoney(psMcap, currency)}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatPrice(impliedSharePrice(psEq, sharesOutstanding), currency)}
                  </td>
                  <RoiTd cagr={psProj?.cagr} />
                  <MoneyTd
                    value={row.fcf}
                    onChange={(fcf) => update(row.id, { fcf })}
                    currency={currency}
                  />
                  <NumTd
                    value={row.pfcfMultiple}
                    onChange={(pfcfMultiple) => update(row.id, { pfcfMultiple })}
                  />
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatMoney(pfcfMcap, currency)}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatPrice(impliedSharePrice(pfcfEq, sharesOutstanding), currency)}
                  </td>
                  <RoiTd cagr={pfcfProj?.cagr} />
                  <MoneyTd
                    value={row.profit}
                    onChange={(profit) => update(row.id, { profit })}
                    currency={currency}
                  />
                  <NumTd
                    value={row.peMultiple}
                    onChange={(peMultiple) => update(row.id, { peMultiple })}
                  />
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatMoney(peMcap, currency)}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatPrice(impliedSharePrice(peEq, sharesOutstanding), currency)}
                  </td>
                  <RoiTd cagr={peProj?.cagr} />
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      className="text-[11px] text-white/35 hover:text-red-300"
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
    </div>
  )
}

function RoiTd({ cagr }: { cagr?: number }) {
  if (cagr == null || !Number.isFinite(cagr)) {
    return <td className="px-2 py-1.5 text-white/30">—</td>
  }
  return (
    <td
      className={`px-2 py-1.5 font-semibold tabular-nums ${
        cagr >= 0 ? 'text-emerald-400' : 'text-red-400'
      }`}
    >
      {formatPercent(cagr)}
    </td>
  )
}

function NumTd({
  value,
  onChange,
}: {
  value: number | null
  onChange: (v: number | null) => void
}) {
  return (
    <td className="px-2 py-1.5">
      <input
        className="input !w-16 !py-1 tabular-nums"
        type="number"
        step="any"
        min={0}
        value={value ?? ''}
        onChange={(e) => {
          if (e.target.value === '') onChange(null)
          else {
            const n = Number(e.target.value)
            onChange(Number.isFinite(n) ? n : null)
          }
        }}
      />
    </td>
  )
}

function MoneyTd({
  value,
  onChange,
  currency,
}: {
  value: number | null
  onChange: (v: number | null) => void
  currency: string
}) {
  return (
    <td className="px-2 py-1.5">
      <input
        className="input !w-24 !py-1"
        type="text"
        inputMode="decimal"
        placeholder="100B"
        defaultValue={value == null ? '' : String(value)}
        key={value == null ? 'empty' : String(value)}
        onBlur={(e) => {
          const raw = e.target.value.trim()
          if (!raw) {
            onChange(null)
            return
          }
          onChange(parseMoney(raw))
        }}
      />
      {value != null && (
        <div className="mt-0.5 text-[10px] text-white/30">{formatMoney(value, currency)}</div>
      )}
    </td>
  )
}
