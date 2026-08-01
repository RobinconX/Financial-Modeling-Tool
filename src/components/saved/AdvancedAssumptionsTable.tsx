import { useState } from 'react'
import type { YearProjection } from '../../types'
import {
  advancedCagrGapYears,
  buildAdvancedProjections,
  equityValueAfterDilution,
  impliedFromPE,
  impliedFromPFCF,
  impliedFromPS,
  materializeAdvancedCagrYears,
  newYearProjection,
  normalizeDilution,
  sortYearProjections,
} from '../../lib/valuation'
import {
  cleanMoneyAmount,
  formatMoney,
  formatPercent,
  formatPrice,
  parseMoney,
} from '../../lib/format'
import { formatInputNumber } from '../common/MoneyInput'
import { impliedSharePrice } from '../../lib/sharePrice'

type Props = {
  rows: YearProjection[]
  onChange: (rows: YearProjection[]) => void
  currentMarketCap: number | null
  sharesOutstanding: number | null
  currency?: string
}

function isAdvancedRowBlank(r: YearProjection): boolean {
  return (
    (r.revenue == null || r.revenue === 0) &&
    (r.psMultiple == null || r.psMultiple === 0) &&
    (r.fcf == null || r.fcf === 0) &&
    (r.pfcfMultiple == null || r.pfcfMultiple === 0) &&
    (r.profit == null || r.profit === 0) &&
    (r.peMultiple == null || r.peMultiple === 0)
  )
}

export function AdvancedAssumptionsTable({
  rows,
  onChange,
  currentMarketCap,
  sharesOutstanding,
  currency: _currency = 'USD',
}: Props) {
  void _currency // Projection tables always display/store USD
  const currentYear = new Date().getFullYear()
  const sorted = sortYearProjections(rows)
  const hasFilledData = sorted.some((r) => !isAdvancedRowBlank(r))
  // Local expand so user can open the table before typing; blank-only legacy rows stay collapsed
  const [forceShow, setForceShow] = useState(false)
  const showTable = forceShow || hasFilledData

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
    const next = rows.filter((r) => r.id !== id)
    commit(next)
    if (next.length === 0) setForceShow(false)
  }

  function add() {
    const last = sorted.length ? sorted[sorted.length - 1] : null
    commit([
      ...rows,
      newYearProjection(last ? last.year + 1 : currentYear + 5, last?.dilutionFactor ?? 1),
    ])
    setForceShow(true)
  }

  const cagrGaps = advancedCagrGapYears(rows)

  function fillIntermediateYears() {
    if (cagrGaps.length === 0) return
    commit(materializeAdvancedCagrYears(rows))
    setForceShow(true)
  }

  function enableAdvanced() {
    // Drop blank legacy placeholders; start with one clean year row
    if (rows.length === 0 || rows.every(isAdvancedRowBlank)) {
      commit([newYearProjection()])
    }
    setForceShow(true)
  }

  function disableAdvanced() {
    commit([])
    setForceShow(false)
  }

  if (!showTable) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 bg-black/15 px-3 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              Advanced · P/S · P/FCF · P/E
            </h3>
            <p className="mt-0.5 text-[11px] text-white/40">
              Optional. Add only if you want valuation from revenue, FCF, or earnings multiples.
            </p>
          </div>
          <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={enableAdvanced}>
            + Add advanced valuation
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            Advanced · P/S · P/FCF · P/E
          </h3>
          {!hasFilledData && (
            <p className="mt-0.5 text-[11px] text-white/35">
              Enter multiples for at least one year, or remove advanced valuation.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs"
            onClick={fillIntermediateYears}
            disabled={cagrGaps.length === 0}
            title={
              cagrGaps.length === 0
                ? 'Need at least two year rows with a gap between them'
                : `Create ${cagrGaps.length} intermediate year${cagrGaps.length === 1 ? '' : 's'} by CAGR on fundamentals`
            }
          >
            {cagrGaps.length === 0
              ? 'Fill intermediates (CAGR)'
              : `Fill ${cagrGaps.length} intermediate${cagrGaps.length === 1 ? '' : 's'} (CAGR)`}
          </button>
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={add}>
            + Year
          </button>
          <button
            type="button"
            className="btn-ghost !py-1 !text-xs text-white/45 hover:text-red-300"
            onClick={disableAdvanced}
            title="Remove all advanced years"
          >
            Remove advanced
          </button>
        </div>
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
                    cellKey={`${row.id}-rev`}
                    value={row.revenue}
                    onChange={(revenue) => update(row.id, { revenue })}
                    currency="USD"
                  />
                  <NumTd
                    value={row.psMultiple}
                    onChange={(psMultiple) => update(row.id, { psMultiple })}
                  />
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatMoney(psMcap, 'USD')}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatPrice(impliedSharePrice(psEq, sharesOutstanding), 'USD')}
                  </td>
                  <RoiTd cagr={psProj?.cagr} />
                  <MoneyTd
                    cellKey={`${row.id}-fcf`}
                    value={row.fcf}
                    onChange={(fcf) => update(row.id, { fcf })}
                    currency="USD"
                  />
                  <NumTd
                    value={row.pfcfMultiple}
                    onChange={(pfcfMultiple) => update(row.id, { pfcfMultiple })}
                  />
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatMoney(pfcfMcap, 'USD')}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatPrice(impliedSharePrice(pfcfEq, sharesOutstanding), 'USD')}
                  </td>
                  <RoiTd cagr={pfcfProj?.cagr} />
                  <MoneyTd
                    cellKey={`${row.id}-profit`}
                    value={row.profit}
                    onChange={(profit) => update(row.id, { profit })}
                    currency="USD"
                  />
                  <NumTd
                    value={row.peMultiple}
                    onChange={(peMultiple) => update(row.id, { peMultiple })}
                  />
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatMoney(peMcap, 'USD')}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-white/70">
                    {formatPrice(impliedSharePrice(peEq, sharesOutstanding), 'USD')}
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
  currency = 'USD',
  cellKey,
}: {
  value: number | null
  onChange: (v: number | null) => void
  currency?: string
  cellKey: string
}) {
  const clean = cleanMoneyAmount(value)
  const display = clean == null ? '' : formatInputNumber(clean, 2)
  return (
    <td className="px-2 py-1.5">
      <input
        className="input !w-24 !py-1"
        type="text"
        inputMode="decimal"
        placeholder="100B"
        defaultValue={display}
        key={`${cellKey}:${display}`}
        onBlur={(e) => {
          const raw = e.target.value.trim()
          if (!raw) {
            onChange(null)
            return
          }
          onChange(cleanMoneyAmount(parseMoney(raw)))
        }}
      />
      {clean != null && (
        <div className="mt-0.5 text-[10px] text-white/30">{formatMoney(clean, currency)}</div>
      )}
    </td>
  )
}
