import { useState } from 'react'
import type {
  CashflowLine,
  CashflowScenario,
  OverviewRunwayConfig,
  OverviewRunwayPeriod,
  OverviewSeries,
  SavingsAccount,
} from '../../types'
import { parseMoney, formatMoney } from '../../lib/format'
import {
  defaultRunwayPeriod,
  periodForYear,
  resolveRunwayDrawOrder,
  runwayIncomeDrawForYear,
} from '../../lib/runway'
import { InfoTip } from '../common/InfoTip'
import { OVERVIEW_CURRENCY } from '../../lib/overview'

type Props = {
  config: OverviewRunwayConfig
  incomeCostScenarios: CashflowScenario[]
  incomeCostLines: CashflowLine[]
  series: OverviewSeries[]
  savingsAccounts: SavingsAccount[]
  onChange: (patch: Partial<OverviewRunwayConfig>) => void
  onUpdateSeries: (id: string, patch: Partial<OverviewSeries>) => void
}

export function RunwayConfig({
  config,
  incomeCostScenarios,
  incomeCostLines,
  series,
  savingsAccounts,
  onChange,
  onUpdateSeries,
}: Props) {
  const periods = [...(config.periods ?? [])].sort((a, b) => a.startYear - b.startYear)
  const sortedIc = [...incomeCostScenarios].sort(
    (a, b) => a.year - b.year || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  )
  const previewYear = periods[0]?.startYear ?? new Date().getFullYear()
  const preview = runwayIncomeDrawForYear(config, previewYear, incomeCostLines)
  const drawList = resolveRunwayDrawOrder(series, config, savingsAccounts)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setDragOverId(null)
      return
    }
    const ids = drawList.map((s) => s.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) {
      setDragId(null)
      setDragOverId(null)
      return
    }
    const next = [...ids]
    next.splice(from, 1)
    next.splice(to, 0, dragId)
    onChange({ drawOrder: next })
    setDragId(null)
    setDragOverId(null)
  }

  function setPeriods(next: OverviewRunwayPeriod[]) {
    onChange({
      periods: [...next].sort((a, b) => a.startYear - b.startYear),
    })
  }

  function patchPeriod(i: number, patch: Partial<OverviewRunwayPeriod>) {
    setPeriods(periods.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-center gap-1.5">
        <span className="section-title">Runway periods</span>
        <InfoTip label="About runway periods">
          Each row starts in that year and lasts until the next row. Runway leftover is a separate
          pile: a copy of Overview leftover, then adjusted by this config (I/C surplus added, draws
          taken from leftover first). Set draw order below. Surplus is not a leftover contribution.
          “Keep I/C” uses that scenario’s income as in and its costs as the draw.
        </InfoTip>
      </div>

      <div className="space-y-2">
        {periods.map((p, i) => {
          const until =
            i + 1 < periods.length ? String(periods[i + 1]!.startYear - 1) : 'chart To'
          return (
            <div
              key={`${p.startYear}-${i}`}
              className="flex flex-wrap items-end gap-2 rounded-md border border-white/10 px-2 py-2"
            >
              <label className="space-y-1 text-white/50">
                <span className="block text-[10px]">From</span>
                <input
                  className="input !w-[4.5rem] !py-1 !text-xs tabular-nums"
                  type="number"
                  value={p.startYear}
                  onChange={(e) =>
                    patchPeriod(i, { startYear: Math.floor(Number(e.target.value)) || p.startYear })
                  }
                />
              </label>
              <span className="pb-1.5 text-[10px] text-white/30">→ {until}</span>

              <label className="space-y-1 text-white/50">
                <span className="block text-[10px]">Mode</span>
                <select
                  className="input !w-auto min-w-[11rem] !py-1 !text-xs"
                  value={p.mode}
                  onChange={(e) => {
                    const mode = e.target.value as OverviewRunwayPeriod['mode']
                    patchPeriod(i, { mode })
                  }}
                >
                  <option value="manual">Manual income</option>
                  <option value="ic-income">I/C income</option>
                  <option value="ic-keep">Keep I/C as in…</option>
                </select>
              </label>

              {p.mode === 'manual' ? (
                <label className="space-y-1 text-white/50">
                  <span className="block text-[10px]">CHF / year</span>
                  <input
                    className="input !w-24 !py-1 !text-xs tabular-nums"
                    defaultValue={p.manualIncomeChf ? String(p.manualIncomeChf) : ''}
                    placeholder="80k"
                    onBlur={(e) => {
                      const n = parseMoney(e.target.value)
                      patchPeriod(i, { manualIncomeChf: n != null && n > 0 ? n : 0 })
                    }}
                  />
                </label>
              ) : (
                <label className="space-y-1 text-white/50">
                  <span className="block text-[10px]">I/C scenario</span>
                  <select
                    className="input !w-auto min-w-[9rem] !py-1 !text-xs"
                    value={p.incomeCostScenarioId ?? ''}
                    onChange={(e) =>
                      patchPeriod(i, { incomeCostScenarioId: e.target.value || null })
                    }
                  >
                    <option value="">Select…</option>
                    {sortedIc.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name.trim() || s.year}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {p.mode !== 'ic-keep' ? (
                <>
                  <label className="space-y-1 text-white/50">
                    <span className="block text-[10px]">Draw</span>
                    <select
                      className="input !w-auto !py-1 !text-xs"
                      value={p.drawMode}
                      onChange={(e) =>
                        patchPeriod(i, { drawMode: e.target.value === 'fixed' ? 'fixed' : 'percent' })
                      }
                    >
                      <option value="percent">% of income</option>
                      <option value="fixed">Fixed CHF</option>
                    </select>
                  </label>
                  {p.drawMode === 'percent' ? (
                    <label className="space-y-1 text-white/50">
                      <span className="block text-[10px]">Percent</span>
                      <input
                        className="input !w-16 !py-1 !text-xs tabular-nums"
                        type="number"
                        value={p.drawPercent}
                        onChange={(e) => patchPeriod(i, { drawPercent: Number(e.target.value) })}
                      />
                    </label>
                  ) : (
                    <label className="space-y-1 text-white/50">
                      <span className="block text-[10px]">CHF / year</span>
                      <input
                        className="input !w-24 !py-1 !text-xs tabular-nums"
                        defaultValue={p.drawFixedChf ? String(p.drawFixedChf) : ''}
                        placeholder="60k"
                        onBlur={(e) => {
                          const n = parseMoney(e.target.value)
                          patchPeriod(i, { drawFixedChf: n != null && n > 0 ? n : 0 })
                        }}
                      />
                    </label>
                  )}
                </>
              ) : (
                <span className="pb-1.5 text-[10px] text-white/35">Draw = I/C costs</span>
              )}

              {periods.length > 1 ? (
                <button
                  type="button"
                  className="btn-ghost mb-0.5 !py-0.5 !text-[11px] text-white/35 hover:text-red-300/80"
                  onClick={() => setPeriods(periods.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn-ghost !py-0.5 !text-[11px]"
          onClick={() => {
            const last = periods[periods.length - 1]
            const start = (last?.startYear ?? new Date().getFullYear()) + 1
            setPeriods([...periods, defaultRunwayPeriod(start)])
          }}
        >
          + Period
        </button>
        <span className="text-[11px] text-white/40">
          {periodForYear(config, previewYear).startYear}:{' '}
          {formatMoney(preview.income, OVERVIEW_CURRENCY)} in →{' '}
          {formatMoney(preview.draw, OVERVIEW_CURRENCY)} out
        </span>
      </div>

      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="section-title">Draw order</span>
          <InfoTip label="About draw order">
            Deficit years spend from the top series first. Drag rows to reorder. Locked until:
            that series is skipped before the stated year. Surplus on leftover is not drawn.
          </InfoTip>
        </div>
        {drawList.map((s, i) => {
          const over = dragOverId === s.id && dragId !== s.id
          return (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => {
                setDragId(s.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', s.id)
              }}
              onDragEnd={() => {
                setDragId(null)
                setDragOverId(null)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dragOverId !== s.id) setDragOverId(s.id)
              }}
              onDragLeave={() => {
                if (dragOverId === s.id) setDragOverId(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                dropOn(s.id)
              }}
              className={`flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 ${
                over ? 'border-sky-400/50 bg-sky-500/10' : 'border-white/10'
              } ${dragId === s.id ? 'opacity-50' : ''}`}
            >
              <span
                className="cursor-grab select-none text-white/30"
                title="Drag to reorder"
                aria-hidden
              >
                ⋮⋮
              </span>
              <span className="w-4 tabular-nums text-[10px] text-white/35">{i + 1}</span>
              <span className="min-w-[8rem] flex-1 truncate text-white/80">
                {s.name.trim() || 'Series'}
              </span>
              <label className="flex items-center gap-1 text-[10px] text-white/45">
                Locked until
                <input
                  className="input !w-[4.5rem] !py-0.5 !text-xs tabular-nums"
                  type="number"
                  defaultValue={s.drawLockedUntilYear ?? ''}
                  placeholder="—"
                  onMouseDown={(e) => e.stopPropagation()}
                  onBlur={(e) => {
                    const raw = e.target.value.trim()
                    if (!raw) {
                      onUpdateSeries(s.id, { drawLockedUntilYear: null })
                      return
                    }
                    const y = Math.floor(Number(raw))
                    onUpdateSeries(s.id, {
                      drawLockedUntilYear:
                        Number.isFinite(y) && y >= 1900 && y <= 2200
                          ? y
                          : s.drawLockedUntilYear ?? null,
                    })
                  }}
                />
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
