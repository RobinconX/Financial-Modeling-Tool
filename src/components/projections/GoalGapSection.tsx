import { useMemo, useState } from 'react'
import type { SavedScenario } from '../../types'
import type { CachedPriceHistory } from '../../lib/priceHistory'
import {
  easyGoalPrice,
  statedEasyYears,
  upsideSeries,
  type GoalGapRow,
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

  const overlayRows = overlayIds
    .map((id) => rows.find((r) => r.scenarioId === id))
    .filter((r): r is GoalGapRow => r != null)

  const overlayYearOptions = useMemo(() => {
    const set = new Set<number>()
    for (const r of overlayRows) {
      const sc = scenarios.find((s) => s.id === r.scenarioId)
      if (sc) for (const y of statedEasyYears(sc)) set.add(y)
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
      const goal = easyGoalPrice(sc, effectiveChartYear)
      const hist = histories[row.symbol.toUpperCase()]
      if (goal == null || !hist) return []
      return [
        {
          key: row.scenarioId,
          name: row.label,
          color: OVERLAY_COLORS[i % OVERLAY_COLORS.length]!,
          points: upsideSeries(goal, hist.points),
        },
      ]
    })
  }, [overlayRows, scenarios, effectiveChartYear, histories])

  const loading = overlayRows.some((r) => loadingSymbols.has(r.symbol.toUpperCase()))
  const error =
    overlayRows.map((r) => errors[r.symbol.toUpperCase()]).find(Boolean) ?? null

  if (overlayRows.length === 0) return null

  return (
    <div className="space-y-2 border-t border-white/[0.06] pt-4">
      <div className="flex flex-wrap items-end gap-3">
        <h3 className="section-title">Remaining upside</h3>
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
      <FullscreenChart title="Remaining upside" className="w-full min-w-0">
        <GoalGapChart
          series={chartSeries}
          loading={loading && chartSeries.every((s) => s.points.length < 2)}
          error={error}
        />
      </FullscreenChart>
    </div>
  )
}
