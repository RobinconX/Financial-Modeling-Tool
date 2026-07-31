import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMoney } from '../../lib/format'
import {
  buildChartRows,
  type ChartResolution,
  SAVINGS_CURRENCY,
} from '../../lib/savings'
import type { SavingsAccount } from '../../types'

const COLORS = [
  '#38bdf8',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#2dd4bf',
  '#fb923c',
  '#818cf8',
  '#e879f9',
  '#94a3b8',
]

type Props = {
  accounts: SavingsAccount[]
  asOf?: Date
  /** Grow to parent height (fullscreen overlay via FullscreenChart) */
  fillContainer?: boolean
}

export function SavingsChart({
  accounts,
  asOf = new Date(),
  fillContainer = false,
}: Props) {
  const [resolution, setResolution] = useState<ChartResolution>('monthly')

  // All hooks must run unconditionally (empty → first account used to crash here).
  const rows = useMemo(
    () => buildChartRows(accounts, asOf, resolution),
    [accounts, asOf, resolution],
  )
  const ids = useMemo(() => accounts.map((a) => a.id), [accounts])
  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of accounts) m.set(a.id, a.name.trim() || 'Account')
    return m
  }, [accounts])

  const tickKeys = useMemo(() => {
    const keep = new Set<string>()
    rows.forEach((r, i) => {
      if (r.isNow || r.kind === 'actual') keep.add(r.key)
      if (r.key.startsWith('+')) {
        // Yearly mode: show every few years to avoid clutter
        if (resolution === 'yearly') {
          const y = Number(r.key.slice(1, -1))
          if (y === 1 || y % 5 === 0 || y === 30) keep.add(r.key)
        } else {
          keep.add(r.key)
        }
      }
      if (r.kind === 'projected' && !r.key.startsWith('+')) {
        // Monthly labels: every other month if dense
        if (i % 2 === 0) keep.add(r.key)
      }
    })
    return keep
  }, [rows, resolution])

  const modeToggle = (
    <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {(
        [
          { id: 'monthly' as const, label: 'Monthly' },
          { id: 'yearly' as const, label: 'Yearly' },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => setResolution(opt.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            resolution === opt.id
              ? 'bg-white text-black shadow'
              : 'text-white/55 hover:text-white'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  if (accounts.length === 0) {
    return (
      <div
        className={
          fillContainer
            ? 'flex h-full min-h-0 w-full flex-col'
            : 'flex w-full flex-col'
        }
      >
        <div className="mb-2 flex justify-end">{modeToggle}</div>
        <div className="flex h-64 flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
          Add accounts on the Inputs tab to see stacked savings over time
        </div>
      </div>
    )
  }

  return (
    <div
      className={
        fillContainer
          ? 'flex h-full min-h-0 w-full flex-col'
          : 'flex w-full flex-col'
      }
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-white/35">
          {resolution === 'monthly'
            ? 'First 12 months, then years 2–5, 10, 15, 20, 25, 30'
            : 'Each year through 30 years'}
        </p>
        {modeToggle}
      </div>
      <div
        className={
          fillContainer
            ? 'relative min-h-0 w-full flex-1'
            : 'relative h-80 w-full min-h-[20rem]'
        }
      >
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(232,238,245,0.45)', fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              interval={0}
              tickFormatter={(label: string, index: number) => {
                const row = rows[index]
                if (!row || !tickKeys.has(row.key)) return ''
                return String(label ?? '')
              }}
            />
            <YAxis
              tick={{ fill: 'rgba(232,238,245,0.4)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={56}
              tickFormatter={(v: number) => {
                if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`
                if (v >= 1e3) return `${(v / 1e3).toFixed(0)}k`
                return String(v)
              }}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as
                  | { kind?: string; isNow?: boolean }
                  | undefined
                const kind = row?.kind
                const isNow = row?.isNow === true
                const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0)
                return (
                  <div className="rounded-xl border border-white/10 bg-[#121820] px-3 py-2 text-xs shadow-xl">
                    <div className="flex items-center gap-2 font-semibold text-white">
                      <span>{isNow ? 'Now' : String(label ?? '')}</span>
                      {isNow ? (
                        <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-300/90">
                          Live
                        </span>
                      ) : kind === 'projected' ? (
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
                          Projected
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400/80">
                          Actual
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 space-y-0.5">
                      {payload.map((p) => {
                        const dataKey = String(p.dataKey ?? '')
                        return (
                          <div key={dataKey} className="flex justify-between gap-4">
                            <span className="text-white/55">
                              {nameById.get(dataKey) ?? dataKey}
                            </span>
                            <span className="tabular-nums text-white/85">
                              {formatMoney(Number(p.value) || 0, SAVINGS_CURRENCY)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-1.5 flex justify-between border-t border-white/10 pt-1.5 font-medium">
                      <span className="text-white/50">Total</span>
                      <span className="tabular-nums text-emerald-400/90">
                        {formatMoney(total, SAVINGS_CURRENCY)}
                      </span>
                    </div>
                  </div>
                )
              }}
            />
            {ids.map((id, i) => (
              <Bar
                key={id}
                dataKey={id}
                name={nameById.get(id) ?? id}
                stackId="savings"
                fill={COLORS[i % COLORS.length]}
                isAnimationActive={false}
              >
                {rows.map((r) => (
                  <Cell
                    key={`${id}-${r.key}`}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={r.isNow ? 1 : r.kind === 'actual' ? 0.92 : 0.38}
                    stroke={r.isNow ? 'rgba(255,255,255,0.45)' : undefined}
                    strokeWidth={r.isNow ? 1.5 : 0}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
