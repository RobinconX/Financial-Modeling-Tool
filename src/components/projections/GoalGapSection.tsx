import { useMemo, useState } from 'react'
import type { SavedScenario } from '../../types'
import type { CachedPriceHistory } from '../../lib/priceHistory'
import {
  goalPriceForBasis,
  localIsoDate,
  pathSeries,
  statedYearsForBasis,
  type GoalGapRow,
  type GoalPathMetric,
} from '../../lib/goalGap'
import { FullscreenChart } from '../common/FullscreenChart'
import { GoalGapChart } from './GoalGapChart'

export const OVERLAY_COLORS = [
  '#34d399',
  '#38bdf8',
  '#a78bfa',
  '#fbbf24',
  '#f472b6',
  '#2dd4bf',
  '#fb923c',
  '#818cf8',
]

type Props = {
  overlayIds: string[]
  onClear: () => void
  rows: GoalGapRow[]
  scenarios: SavedScenario[]
  goalYear: number | null
  histories: Record<string, CachedPriceHistory>
  loadingSymbols: Set<string>
  errors: Record<string, string>
}

export function GoalGapSection({
  overlayIds,
  onClear,
  rows,
  scenarios,
  goalYear,
  histories,
  loadingSymbols,
  errors,
}: Props) {
  const [chartYear, setChartYear] = useState<number | null>(null)
  const [metric, setMetric] = useState<GoalPathMetric>('upside')

  const overlayRows = overlayIds
    .map((id) => rows.find((r) => r.scenarioId === id))
    .filter((r): r is GoalGapRow => r != null)

  const overlayYearOptions = useMemo(() => {
    const set = new Set<number>()
    for (const r of overlayRows) {
      const sc = scenarios.find((s) => s.id === r.scenarioId)
      if (sc) for (const y of statedYearsForBasis(sc, r.basis)) set.add(y)
    }
    return [...set].sort((a, b) => a - b)
  }, [overlayRows, scenarios])

  const effectiveChartYear =
    chartYear != null && overlayYearOptions.includes(chartYear)
      ? chartYear
      : goalYear != null && overlayYearOptions.includes(goalYear)
        ? goalYear
        : (overlayYearOptions[overlayYearOptions.length - 1] ?? null)

  const chartSeries = useMemo(() => {
    if (effectiveChartYear == null) return []
    return overlayRows.flatMap((row, i) => {
      const sc = scenarios.find((s) => s.id === row.scenarioId)
      if (!sc) return []
      const goal = goalPriceForBasis(sc, row.basis, effectiveChartYear)
      const hist = histories[row.symbol.toUpperCase()]
      if (goal == null || !hist) return []
      return [
        {
          key: row.scenarioId,
          name: row.label,
          color: OVERLAY_COLORS[i % OVERLAY_COLORS.length]!,
          points: pathSeries(
            goal,
            hist.points,
            metric,
            effectiveChartYear,
            row.spot != null && row.spot > 0
              ? { date: localIsoDate(), price: row.spot }
              : null,
          ),
        },
      ]
    })
  }, [overlayRows, scenarios, effectiveChartYear, histories, metric])

  const loading = overlayRows.some((r) => loadingSymbols.has(r.symbol.toUpperCase()))
  const error =
    overlayRows.map((r) => errors[r.symbol.toUpperCase()]).find(Boolean) ?? null

  if (overlayRows.length === 0) return null

  return (
    <div className="space-y-2 border-t border-white/[0.06] pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <h3 className="section-title">
          {metric === 'cagr' ? 'CAGR' : 'Remaining upside'}
        </h3>
        <div
          className="inline-flex gap-1 border-b border-white/10"
          role="group"
          aria-label="Chart metric"
        >
          {(
            [
              { id: 'upside' as const, label: 'Upside %' },
              { id: 'cagr' as const, label: 'CAGR %' },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMetric(t.id)}
              className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                metric === t.id
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-white/50">
          Goal year
          <select
            className="input !w-auto !py-1 !text-xs"
            value={effectiveChartYear ?? ''}
            disabled={overlayYearOptions.length === 0}
            onChange={(e) => {
              const y = Number(e.target.value)
              if (Number.isFinite(y)) setChartYear(y)
            }}
          >
            {overlayYearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        {overlayRows.length > 0 ? (
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>
      <FullscreenChart
        title={metric === 'cagr' ? 'CAGR to goal' : 'Remaining upside'}
        className="w-full min-w-0"
      >
        <GoalGapChart
          series={chartSeries}
          metric={metric}
          loading={loading && chartSeries.every((s) => s.points.length < 2)}
          error={error}
        />
      </FullscreenChart>
    </div>
  )
}
