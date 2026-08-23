import { useEffect, useState, type MouseEvent } from 'react'
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
  resolveRunwayDrawOrder,
  runwayIncomeDrawForYear,
} from '../../lib/runway'
import { InfoTip } from '../common/InfoTip'
import { OVERVIEW_CURRENCY } from '../../lib/overview'

/** Controlled number that types freely and commits on blur / Enter. */
function CommitOnBlurNumber({
  value,
  parse,
  onCommit,
  className,
  placeholder,
  onMouseDown,
}: {
  value: number | null
  /** `undefined` = invalid (revert). `null` = empty commit. */
  parse: (raw: string) => number | null | undefined
  onCommit: (n: number | null) => void
  className: string
  placeholder?: string
  onMouseDown?: (e: MouseEvent<HTMLInputElement>) => void
}) {
  const shown = value == null ? '' : String(value)
  const [draft, setDraft] = useState(shown)
  useEffect(() => {
    setDraft(shown)
  }, [shown])

  function commit() {
    const result = parse(draft.trim())
    if (result === undefined) {
      setDraft(shown)
      return
    }
    onCommit(result)
    setDraft(result == null ? '' : String(result))
  }

  return (
    <input
      className={className}
      type="number"
      value={draft}
      placeholder={placeholder}
      onMouseDown={onMouseDown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}

function parseYear(raw: string): number | undefined {
  if (!raw) return undefined
  const y = Math.floor(Number(raw))
  if (!Number.isFinite(y) || y < 1900 || y > 2200) return undefined
  return y
}

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
          const { income, draw } = runwayIncomeDrawForYear(
            config,
            p.startYear,
            incomeCostLines,
          )
          return (
            <div
              key={`${p.startYear}-${i}`}
              className="flex flex-wrap items-end gap-2 rounded-md border border-white/10 px-2 py-2"
            >
              <label className="space-y-1 text-white/50">
                <span className="block text-[10px]">From</span>
                <CommitOnBlurNumber
                  className="input !w-[4.5rem] !py-1 !text-xs tabular-nums"
                  value={p.startYear}
                  parse={parseYear}
                  onCommit={(y) => {
                    if (y != null) patchPeriod(i, { startYear: y })
                  }}
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
                      <CommitOnBlurNumber
                        className="input !w-16 !py-1 !text-xs tabular-nums"
                        value={p.drawPercent}
                        parse={(raw) => {
                          if (!raw) return 0
                          const n = Number(raw)
                          return Number.isFinite(n) ? n : undefined
                        }}
                        onCommit={(n) => patchPeriod(i, { drawPercent: n ?? 0 })}
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

              <span className="pb-1.5 text-[10px] text-white/40 tabular-nums">
                {formatMoney(income, OVERVIEW_CURRENCY)} in →{' '}
                {formatMoney(draw, OVERVIEW_CURRENCY)} out
              </span>

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
      </div>

      <div className="space-y-2 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="section-title">Draw order</span>
          <InfoTip label="About draw order">
            Deficit years spend from the top series first. Drag rows to reorder. Locked until:
            that series is skipped before the stated year. The Before / After slider is when
            that pile is tapped: after growth (compound first) or before growth (take from last
            year’s leftover, then compound the rest). This year’s deposits are not used to cover
            a before-growth draw. Surplus on leftover is not drawn.
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
              <button
                type="button"
                role="switch"
                aria-checked={s.drawTiming === 'drawFirst'}
                aria-label={`${s.name.trim() || 'Series'}: draw before or after growth`}
                title="When this pile pays: before it grows, or after. Click to switch."
                className="flex cursor-pointer items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] text-white/45 hover:bg-white/5"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() =>
                  onUpdateSeries(s.id, {
                    drawTiming: s.drawTiming === 'drawFirst' ? 'growFirst' : 'drawFirst',
                  })
                }
              >
                <span className={s.drawTiming === 'drawFirst' ? 'text-white/80' : 'text-white/30'}>
                  Before
                </span>
                <span className="relative h-4 w-8 shrink-0 rounded-full bg-white/15">
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-[left] ${
                      s.drawTiming === 'drawFirst' ? 'left-0.5' : 'left-[1.125rem]'
                    }`}
                  />
                </span>
                <span className={s.drawTiming !== 'drawFirst' ? 'text-white/80' : 'text-white/30'}>
                  After
                </span>
              </button>
              <label className="flex items-center gap-1 text-[10px] text-white/45">
                Locked until
                <CommitOnBlurNumber
                  className="input !w-[4.5rem] !py-0.5 !text-xs tabular-nums"
                  value={s.drawLockedUntilYear ?? null}
                  placeholder="—"
                  parse={(raw) => (raw ? parseYear(raw) : null)}
                  onMouseDown={(e) => e.stopPropagation()}
                  onCommit={(y) => onUpdateSeries(s.id, { drawLockedUntilYear: y })}
                />
              </label>
            </div>
          )
        })}
      </div>
    </div>
  )
}
