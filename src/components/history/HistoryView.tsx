import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavedPortfolio, SavingsAccount } from '../../types'
import { fetchFxRateClient } from '../../lib/fx'
import { formatMoney, formatPercent } from '../../lib/format'
import {
  buildHistoryChart,
  buildHistoryTable,
  collectHistorySeries,
  historySnapshot,
  seriesCompleteness,
  type HistoryCompleteness,
  type HistoryResolution,
} from '../../lib/history'
import { useChartAnnotations } from '../../hooks/useChartAnnotations'
import { FullscreenChart } from '../common/FullscreenChart'
import { ChartNotes } from '../common/ChartNotes'
import { InfoTip } from '../common/InfoTip'
import { HistoryChart, type HistoryChartKind, type HistoryChartSplit } from './HistoryChart'

const INCLUDED_KEY = 'grok-lab-history-series'
const RES_KEY = 'grok-lab-history-resolution'
const KIND_KEY = 'grok-lab-history-chart-kind'
const SPLIT_KEY = 'grok-lab-history-chart-split'

type Props = {
  portfolios: SavedPortfolio[]
  savingsAccounts: SavingsAccount[]
}

function readJsonIds(): string[] | null {
  try {
    const raw = localStorage.getItem(INCLUDED_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((x): x is string => typeof x === 'string')
  } catch {
    return null
  }
}

function readRes(): HistoryResolution {
  try {
    const v = localStorage.getItem(RES_KEY)
    if (v === 'yearly' || v === 'monthly') return v
  } catch {
    /* ignore */
  }
  return 'monthly'
}

function readKind(): HistoryChartKind {
  try {
    if (localStorage.getItem(KIND_KEY) === 'stacked') return 'stacked'
  } catch {
    /* ignore */
  }
  return 'line'
}

function readSplit(): HistoryChartSplit {
  try {
    if (localStorage.getItem(SPLIT_KEY) === 'assets') return 'assets'
  } catch {
    /* ignore */
  }
  return 'total'
}

export function HistoryView({ portfolios, savingsAccounts }: Props) {
  const [usdToChf, setUsdToChf] = useState<number | null>(null)
  const [fxError, setFxError] = useState<string | null>(null)
  const [resolution, setResolution] = useState<HistoryResolution>(readRes)
  const [kind, setKind] = useState<HistoryChartKind>(readKind)
  const [split, setSplit] = useState<HistoryChartSplit>(readSplit)
  const [includedOverride, setIncludedOverride] = useState<string[] | null>(() => readJsonIds())
  const [fromDraft, setFromDraft] = useState('')
  const [toDraft, setToDraft] = useState('')
  const [fromYear, setFromYear] = useState<number | null>(null)
  const [toYear, setToYear] = useState<number | null>(null)
  const [sort, setSort] = useState<'latest' | 'yoy'>('latest')
  const {
    annotations,
    error: notesError,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
  } = useChartAnnotations()

  const loadFx = useCallback(async () => {
    setFxError(null)
    try {
      const q = await fetchFxRateClient('USD', 'CHF')
      setUsdToChf(q.rate)
    } catch (err) {
      setFxError(err instanceof Error ? err.message : 'FX unavailable')
    }
  }, [])

  useEffect(() => {
    void loadFx()
  }, [loadFx])

  const allSeries = useMemo(
    () => collectHistorySeries(portfolios, savingsAccounts, usdToChf),
    [portfolios, savingsAccounts, usdToChf],
  )

  const includedIds = useMemo(() => {
    const allIds = allSeries.map((s) => s.id)
    if (includedOverride == null) return new Set(allIds)
    return new Set(includedOverride.filter((id) => allIds.includes(id)))
  }, [allSeries, includedOverride])

  const included = useMemo(
    () => allSeries.filter((s) => includedIds.has(s.id)),
    [allSeries, includedIds],
  )

  const dataYears = useMemo(() => {
    const ys = new Set<number>()
    for (const s of allSeries) {
      for (const p of s.points) ys.add(p.year)
    }
    return [...ys].sort((a, b) => a - b)
  }, [allSeries])

  const rangeFrom = fromYear ?? dataYears[0] ?? new Date().getFullYear()
  const rangeTo = toYear ?? dataYears[dataYears.length - 1] ?? new Date().getFullYear()

  useEffect(() => {
    if (fromDraft || toDraft) return
    if (dataYears.length === 0) return
    setFromDraft(String(dataYears[0]))
    setToDraft(String(dataYears[dataYears.length - 1]))
  }, [dataYears, fromDraft, toDraft])

  useEffect(() => {
    try {
      localStorage.setItem(RES_KEY, resolution)
      localStorage.setItem(KIND_KEY, kind)
      localStorage.setItem(SPLIT_KEY, split)
      localStorage.setItem(INCLUDED_KEY, JSON.stringify([...includedIds]))
    } catch {
      /* ignore */
    }
  }, [resolution, kind, split, includedIds])

  const chart = useMemo(
    () => buildHistoryChart(included, resolution, rangeFrom, rangeTo),
    [included, resolution, rangeFrom, rangeTo],
  )
  const table = useMemo(
    () => buildHistoryTable(included, rangeFrom, rangeTo),
    [included, rangeFrom, rangeTo],
  )
  const snap = useMemo(
    () => historySnapshot(included, rangeFrom, rangeTo),
    [included, rangeFrom, rangeTo],
  )

  const tableRows = useMemo(() => {
    const rows = [...table.rows]
    rows.sort((a, b) => {
      if (sort === 'yoy') {
        const av = a.yoy
        const bv = b.yoy
        const aOk = av != null
        const bOk = bv != null
        if (aOk && bOk && av !== bv) return bv! - av!
        if (aOk !== bOk) return aOk ? -1 : 1
      }
      const av = a.latest
      const bv = b.latest
      const aOk = av != null
      const bOk = bv != null
      if (aOk && bOk && av !== bv) return bv! - av!
      if (aOk !== bOk) return aOk ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    return rows
  }, [table.rows, sort])

  function applyPeriod(fromRaw: string, toRaw: string) {
    const a = Number(fromRaw)
    const b = Number(toRaw)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return
    if (a < 1000 || a > 9999 || b < 1000 || b > 9999) return
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    if (lo === rangeFrom && hi === rangeTo) return
    setFromYear(lo)
    setToYear(hi)
  }

  function toggleSeries(id: string) {
    const next = new Set(includedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setIncludedOverride([...next])
  }

  const completeness = useMemo(() => {
    const asOf = new Date()
    const map = new Map<string, HistoryCompleteness>()
    for (const s of allSeries) {
      map.set(s.id, seriesCompleteness(s, asOf, rangeFrom, rangeTo))
    }
    return map
  }, [allSeries, rangeFrom, rangeTo])

  const attentionCount = included.filter((s) => {
    const c = completeness.get(s.id)
    return c && (c.stale || c.gapCount > 0)
  }).length

  const portfoliosGroup = allSeries.filter((s) => s.kind === 'portfolio')
  const savingsGroup = allSeries.filter((s) => s.kind === 'savings')
  const needsFx = allSeries.some((s) => !s.inChf)
  const yoyPositive = snap.yoy != null && snap.yoy >= 0

  if (allSeries.length === 0) {
    return (
      <p className="px-1 py-10 text-center text-sm text-white/40">
        Add monthly totals on Portfolio → Actuals, or year-end balances on Savings → Actuals.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <InfoTip label="About history">
            Recorded end-of-month actuals only — portfolios and savings. Yearly uses the last month
            you entered in that year. Totals are CHF; USD portfolios join once a rate is available.
          </InfoTip>
          <Seg
            label="Resolution"
            value={resolution}
            options={[
              { id: 'monthly', label: 'Monthly' },
              { id: 'yearly', label: 'Yearly' },
            ]}
            onChange={setResolution}
          />
          <Seg
            label="Chart"
            value={kind}
            options={[
              { id: 'line', label: 'Line' },
              { id: 'stacked', label: 'Stacked' },
            ]}
            onChange={setKind}
          />
          <Seg
            label="Series"
            value={split}
            options={[
              { id: 'total', label: 'Total' },
              { id: 'assets', label: 'By asset' },
            ]}
            onChange={setSplit}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-white/50">
            From
            <input
              className="input !w-[5.5rem] !py-1 !text-xs tabular-nums"
              type="number"
              value={fromDraft}
              onChange={(e) => {
                const v = e.target.value
                setFromDraft(v)
                applyPeriod(v, toDraft)
              }}
              onBlur={() => applyPeriod(fromDraft, toDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyPeriod(fromDraft, toDraft)
              }}
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-white/50">
            To
            <input
              className="input !w-[5.5rem] !py-1 !text-xs tabular-nums"
              type="number"
              value={toDraft}
              onChange={(e) => {
                const v = e.target.value
                setToDraft(v)
                applyPeriod(fromDraft, toDraft)
              }}
              onBlur={() => applyPeriod(fromDraft, toDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyPeriod(fromDraft, toDraft)
              }}
            />
          </label>
        </div>
      </div>

      {needsFx ? (
        <p className="text-[11px] text-amber-300/90">
          Some portfolio actuals are in USD
          {fxError ? ` — ${fxError}` : ' and need a CHF rate to join the total'}.
          <button type="button" className="btn-ghost ml-2 !py-0.5 !text-[11px]" onClick={() => void loadFx()}>
            Retry FX
          </button>
        </p>
      ) : null}

      <div className="panel space-y-3">
        <FullscreenChart title="Recorded actuals">
          <HistoryChart
            rows={chart.rows}
            series={included}
            kind={kind}
            split={split}
            annotations={annotations}
          />
        </FullscreenChart>
        <ChartNotes
          annotations={annotations}
          error={notesError}
          defaultYear={rangeTo}
          onAdd={addAnnotation}
          onUpdate={updateAnnotation}
          onRemove={removeAnnotation}
        />
        <p className="text-sm text-white/70">
          Latest{' '}
          <span className="tabular-nums text-white">
            {formatMoney(snap.total, 'CHF')}
          </span>
          {snap.asOfLabel ? (
            <span className="text-white/40"> · {snap.asOfLabel}</span>
          ) : null}
          {snap.yoy != null ? (
            <span className={`ml-2 tabular-nums ${yoyPositive ? 'text-emerald-300/90' : 'text-red-300/90'}`}>
              {yoyPositive ? '+' : ''}
              {formatPercent(snap.yoy)}
              {snap.prevYear != null ? ` vs ${snap.prevYear} year-end` : ''}
            </span>
          ) : null}
        </p>
      </div>

      <div>
        <div className="section-header mb-2">
          <h3 className="section-title">Include</h3>
        </div>
        {portfoliosGroup.length > 0 ? (
          <Group
            label="Portfolios"
            series={portfoliosGroup}
            included={includedIds}
            completeness={completeness}
            onToggle={toggleSeries}
          />
        ) : null}
        {savingsGroup.length > 0 ? (
          <Group
            label="Savings"
            series={savingsGroup}
            included={includedIds}
            completeness={completeness}
            onToggle={toggleSeries}
          />
        ) : null}
        {attentionCount > 0 ? (
          <p className="mt-1.5 text-[11px] text-amber-300/80">
            {attentionCount} included series{' '}
            {attentionCount === 1 ? 'needs' : 'need'} attention (stale or gaps).
          </p>
        ) : null}
      </div>

      <div>
        <div className="section-header mb-2">
          <h3 className="section-title">Year-end</h3>
          <div
            className="inline-flex gap-1 border-b border-white/10"
            role="group"
            aria-label="Sort table"
          >
            <button
              type="button"
              className={`-mb-px border-b-2 px-2 py-1 text-[11px] font-medium ${
                sort === 'latest' ? 'border-emerald-400 text-white' : 'border-transparent text-white/50'
              }`}
              onClick={() => setSort('latest')}
            >
              Latest
            </button>
            <button
              type="button"
              className={`-mb-px border-b-2 px-2 py-1 text-[11px] font-medium ${
                sort === 'yoy' ? 'border-emerald-400 text-white' : 'border-transparent text-white/50'
              }`}
              onClick={() => setSort('yoy')}
            >
              YoY
            </button>
          </div>
        </div>
        <div className="table-shell overflow-x-auto">
          <table className="min-w-[480px] text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="sticky left-0 z-10 bg-[#121820] px-3 py-2 text-left font-medium">
                  Series
                </th>
                {table.years.map((y) => (
                  <th key={y} className="px-3 py-2 text-right font-medium tabular-nums">
                    {y}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">YoY</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 text-white/85">
                  <td className="sticky left-0 z-10 bg-[#121820] px-3 py-2">
                    <span
                      className="mr-1.5 inline-block h-2 w-2 rounded-sm"
                      style={{ background: r.color }}
                    />
                    {r.name}
                    {!r.inChf ? (
                      <span className="ml-1 text-[10px] text-amber-300/80">USD</span>
                    ) : null}
                  </td>
                  {table.years.map((y) => (
                    <td key={y} className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(r.byYear[y], r.inChf ? 'CHF' : 'USD')}
                    </td>
                  ))}
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      r.yoy != null && r.yoy >= 0 ? 'text-emerald-300/90' : 'text-red-300/80'
                    }`}
                  >
                    {formatPercent(r.yoy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Seg<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div
      className="inline-flex gap-1 border-b border-white/10"
      role="group"
      aria-label={label}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
            value === o.id
              ? 'border-emerald-400 text-white'
              : 'border-transparent text-white/50 hover:text-white/80'
          }`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function completenessHint(c: HistoryCompleteness | undefined): string | null {
  if (!c) return null
  const bits: string[] = []
  if (c.stale && c.lastKey) bits.push(`stale · ${c.lastKey}`)
  if (c.gapCount > 0) bits.push(`${c.gapCount} gap${c.gapCount === 1 ? '' : 's'}`)
  return bits.length ? bits.join(' · ') : null
}

function Group({
  label,
  series,
  included,
  completeness,
  onToggle,
}: {
  label: string
  series: { id: string; name: string; color: string; inChf: boolean }[]
  included: Set<string>
  completeness: Map<string, HistoryCompleteness>
  onToggle: (id: string) => void
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-white/35">
        {label}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {series.map((s) => {
          const hint = completenessHint(completeness.get(s.id))
          return (
          <label
            key={s.id}
            className="flex cursor-pointer items-center gap-1.5 text-xs text-white/80"
            title={hint ?? undefined}
          >
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-emerald-500"
              checked={included.has(s.id)}
              onChange={() => onToggle(s.id)}
            />
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.name}
            {!s.inChf ? <span className="text-[10px] text-amber-300/80">USD</span> : null}
            {hint ? <span className="text-[10px] text-amber-300/75">{hint}</span> : null}
          </label>
          )
        })}
      </div>
    </div>
  )
}
