import { useEffect, useMemo, useState } from 'react'
import type { DisplayCurrency } from '../../types'
import { formatMoney, formatPercent } from '../../lib/format'
import type {
  PerformanceMetricBreakdown,
  PerformanceBreakdownRow,
} from '../../lib/portfolioPerformanceBreakdown'

type Props = {
  open: boolean
  breakdown: PerformanceMetricBreakdown | null
  displayCurrency: DisplayCurrency
  onClose: () => void
}

type SortKey = 'contribution' | 'symbol'
type SortDir = 'asc' | 'desc'

export function PerformanceMetricDrawer({
  open,
  breakdown,
  displayCurrency,
  onClose,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('contribution')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const sortedRows = useMemo(() => {
    if (!breakdown) return []
    const rows = [...breakdown.rows]
    rows.sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'symbol') {
        return mul * a.symbol.localeCompare(b.symbol)
      }
      return mul * (a.contribution - b.contribution)
    })
    return rows
  }, [breakdown, sortKey, sortDir])

  if (!open || !breakdown) return null

  const fmt = (n: number | null) =>
    n != null && Number.isFinite(n) ? formatMoney(n, displayCurrency) : '—'

  return (
  <>
    <button
      type="button"
      className="fixed inset-0 z-40 bg-black/55 lg:bg-black/45"
      aria-label="Close metric detail"
      onClick={onClose}
    />
    <div
      className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-white/10 bg-[#0c1220] shadow-2xl max-lg:inset-0 max-lg:max-w-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="perf-metric-drawer-title"
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div>
          <h3
            id="perf-metric-drawer-title"
            className="text-base font-semibold text-white"
          >
            {breakdown.title}
          </h3>
          <p className="mt-1 text-xs text-white/55">{breakdown.formula}</p>
        </div>
        <button
          type="button"
          className="btn-ghost !px-2 !py-1 !text-xs"
          onClick={onClose}
        >
          Close
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <section>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
            Inputs
          </h4>
          <dl className="mt-2 space-y-1 text-xs">
            {breakdown.inputs.map((inp) => (
              <div key={inp.label} className="flex justify-between gap-3">
                <dt className="text-white/45">{inp.label}</dt>
                <dd className="tabular-nums text-white/85">{inp.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {breakdown.warnings.length > 0 ? (
          <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
            <p className="font-semibold text-amber-200/90">Warnings</p>
            <ul className="mt-1 list-disc pl-4">
              {breakdown.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {breakdown.reconciliation ? (
          <section className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
              Chart vs Performance
            </h4>
            <p className="text-[11px] text-white/50">
              {breakdown.reconciliation.cashSourceLabel}
            </p>
            <p className="text-[11px] text-white/40">
              {breakdown.reconciliation.cashResolutionNote}
            </p>
            <dl className="space-y-1 text-xs">
              {breakdown.reconciliation.lines.map((line) => (
                <div key={line.label} className="flex justify-between gap-2">
                  <dt className="text-white/50">{line.label}</dt>
                  <dd className="tabular-nums text-white/85">{fmt(line.amount)}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-2 border-t border-white/10 pt-1 font-medium">
                <dt className="text-white/70">Gap</dt>
                <dd className="tabular-nums text-white">
                  {fmt(breakdown.reconciliation.gap)}
                </dd>
              </div>
            </dl>
          </section>
        ) : null}

        {breakdown.twrMeta ? (
          <section className="text-xs text-white/65">
            <p>
              TWR status:{' '}
              {breakdown.twrMeta.twr.status === 'ok'
                ? formatPercent(breakdown.twrMeta.twr.twr ?? 0)
                : breakdown.twrMeta.twr.reason ?? breakdown.twrMeta.twr.status}
            </p>
            {breakdown.twrMeta.missingSymbols.length > 0 ? (
              <p className="mt-1 text-amber-200/80">
                Missing history: {breakdown.twrMeta.missingSymbols.join(', ')}
              </p>
            ) : null}
          </section>
        ) : null}

        {breakdown.mwrMeta ? (
          <section className="text-xs text-white/65">
            <p>Terminal NAV: {fmt(breakdown.mwrMeta.terminalNav)}</p>
            <p className="mt-1">Cash: {breakdown.mwrMeta.cashSourceLabel}</p>
          </section>
        ) : null}

        {sortedRows.length > 0 ? (
          <section>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
                By symbol
              </h4>
              <select
                className="input !w-auto !py-0.5 !text-[10px]"
                value={`${sortKey}:${sortDir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':') as [SortKey, SortDir]
                  setSortKey(k)
                  setSortDir(d)
                }}
                aria-label="Sort breakdown"
              >
                <option value="contribution:desc">Contribution ↓</option>
                <option value="contribution:asc">Contribution ↑</option>
                <option value="symbol:asc">Symbol A–Z</option>
              </select>
            </div>
            <BreakdownTable rows={sortedRows} fmt={fmt} />
          </section>
        ) : null}
      </div>
    </div>
  </>
  )
}

function BreakdownTable({
  rows,
  fmt,
}: {
  rows: PerformanceBreakdownRow[]
  fmt: (n: number | null) => string
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-white/10">
      <table className="w-full min-w-[28rem] text-left text-[11px]">
        <thead className="bg-white/[0.04] text-white/45">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Symbol</th>
            <th className="px-2 py-1.5 font-semibold">Type</th>
            <th className="px-2 py-1.5 text-right font-semibold">Contrib.</th>
            <th className="px-2 py-1.5 text-right font-semibold">Shares</th>
            <th className="px-2 py-1.5 text-right font-semibold">Basis</th>
            <th className="px-2 py-1.5 text-right font-semibold">Mark</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-white/[0.06]">
              <td className="px-2 py-1.5 text-white/90">{r.symbol}</td>
              <td className="px-2 py-1.5 text-white/50">{r.kind}</td>
              <td className="px-2 py-1.5 text-right tabular-nums text-white/85">
                {fmt(r.contribution)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-white/60">
                {r.shares != null ? r.shares.toLocaleString() : '—'}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-white/60">
                {fmt(r.costBasis)}
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-white/60">
                {r.markPrice != null ? fmt(r.markPrice) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}