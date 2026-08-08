import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  CashflowLine,
  CashflowScenario,
  SavingsAccount,
  WorkingBalanceDraw,
} from '../../types'
import {
  INCOME_COST_CURRENCY,
  MONTH_LABELS,
  buildMonthlySchedule,
  drawsForScenario,
  normalizeAmounts12,
  oneTimeMissingMonthCount,
  scenarioTotals,
} from '../../lib/incomeCost'
import {
  getPermanentCashAccount,
  yearEndBalance,
} from '../../lib/savings'
import { formatMoney, parseMoney } from '../../lib/format'
import { formatInputNumber } from '../common/MoneyInput'
import { FullscreenChart } from '../common/FullscreenChart'

type Props = {
  scenario: CashflowScenario
  lines: CashflowLine[]
  draws: WorkingBalanceDraw[]
  /** Permanent Cash savings account feeds prior-year opening balance */
  savingsAccounts: SavingsAccount[]
  onUpsertDraw: (draw: WorkingBalanceDraw) => void
  onRemoveDraw: (id: string) => void
  onAddDraw: () => void
}

function formatAxis(v: number): string {
  if (!Number.isFinite(v)) return ''
  const abs = Math.abs(v)
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}k`
  return String(Math.round(v))
}

/** Tooltip / legend order = action sequence top → bottom */
const TOOLTIP_ORDER = [
  'Inflow',
  'Outflow (budget)',
  'Working balance',
  'Draws',
  'After draws',
] as const

type TipPayloadItem = {
  name?: string
  value?: number | string
  color?: string
  dataKey?: string | number
}

function MonthlyFlowTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TipPayloadItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const byName = new Map(
    payload.map((p) => [String(p.name ?? p.dataKey ?? ''), p]),
  )
  const ordered = TOOLTIP_ORDER.map((n) => byName.get(n)).filter(
    (p): p is TipPayloadItem => p != null,
  )
  // Any unexpected series last
  for (const p of payload) {
    const n = String(p.name ?? p.dataKey ?? '')
    if (!TOOLTIP_ORDER.includes(n as (typeof TOOLTIP_ORDER)[number])) {
      ordered.push(p)
    }
  }
  return (
    <div className="rounded-lg border border-white/10 bg-[#121820] px-3 py-2 text-xs shadow-xl">
      <div className="mb-1.5 font-medium text-white/70">{label}</div>
      <div className="space-y-1">
        {ordered.map((p) => {
          const name = String(p.name ?? p.dataKey ?? '')
          const color = p.color ?? '#94a3b8'
          return (
            <div
              key={name}
              className="flex items-center justify-between gap-4"
            >
              <span className="inline-flex items-center gap-1.5 text-white/60">
                <span
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ background: color }}
                />
                {name}
              </span>
              <span className="tabular-nums text-white/90">
                {formatMoney(Number(p.value) || 0, INCOME_COST_CURRENCY)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MonthlyFlowChart({
  schedule,
  fillContainer = false,
}: {
  schedule: ReturnType<typeof buildMonthlySchedule>
  fillContainer?: boolean
}) {
  const hasAnyCash = schedule.some(
    (p) => p.income > 0 || p.cost > 0 || p.draw > 0,
  )
  return (
    <div
      className={
        fillContainer ? 'flex h-full min-h-0 w-full flex-col' : 'w-full'
      }
    >
      <div
        className={
          fillContainer ? 'min-h-0 w-full flex-1' : 'h-80 w-full min-h-[20rem]'
        }
      >
        {!hasAnyCash ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
            Add income, costs, or draws to see the monthly path
          </div>
        ) : (
          <ResponsiveContainer
            width="100%"
            height="100%"
            minHeight={fillContainer ? 280 : undefined}
          >
            <ComposedChart
              data={schedule}
              margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'rgba(232,238,245,0.45)', fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              />
              <YAxis
                yAxisId="flow"
                tick={{ fill: 'rgba(232,238,245,0.4)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={formatAxis}
              />
              <YAxis
                yAxisId="bal"
                orientation="right"
                tick={{ fill: 'rgba(232,238,245,0.35)', fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={formatAxis}
              />
              <Tooltip content={<MonthlyFlowTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, color: 'rgba(232,238,245,0.5)' }}
              />
              {/* Series order matches action flow; tooltip uses TOOLTIP_ORDER */}
              <Bar
                yAxisId="flow"
                dataKey="income"
                name="Inflow"
                fill="#34d399"
                fillOpacity={0.85}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
              <Bar
                yAxisId="flow"
                dataKey="cost"
                name="Outflow (budget)"
                fill="#fbbf24"
                fillOpacity={0.8}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
              <Line
                yAxisId="bal"
                type="monotone"
                dataKey="balance"
                name="Working balance"
                stroke="#38bdf8"
                strokeWidth={2}
                dot={{ r: 3, fill: '#38bdf8' }}
                isAnimationActive={false}
              />
              <Bar
                yAxisId="flow"
                dataKey="draw"
                name="Draws"
                fill="#c084fc"
                fillOpacity={0.85}
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              />
              <Line
                yAxisId="bal"
                type="monotone"
                dataKey="balanceAfterDraws"
                name="After draws"
                stroke="#f472b6"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={{ r: 3, fill: '#f472b6' }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

function DrawsEditor({
  draws,
  onUpsertDraw,
  onRemoveDraw,
  onAddDraw,
}: {
  draws: WorkingBalanceDraw[]
  onUpsertDraw: (draw: WorkingBalanceDraw) => void
  onRemoveDraw: (id: string) => void
  onAddDraw: () => void
}) {
  const rows = [...draws].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  )

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            Working balance draws
          </h3>
          <p className="mt-0.5 text-[11px] text-white/35">
            Informative only — does not change Income/Cost budget, Sankey, or portfolio deposits.
          </p>
        </div>
        <button type="button" className="btn-ghost !py-1 !text-xs" onClick={onAddDraw}>
          + Draw
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-xs text-white/40">
          Add a named draw and enter CHF to take from working balance each month.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-max min-w-full border-collapse text-left text-xs">
            <colgroup>
              <col className="w-[9.5rem]" />
              {MONTH_LABELS.map((m) => (
                <col key={m} className="w-[4.25rem]" />
              ))}
              <col className="w-[5.5rem]" />
              <col className="w-8" />
            </colgroup>
            <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-white/45">
              <tr>
                <th className="sticky left-0 z-10 border-b border-white/10 bg-[#141a22] px-2 py-2 text-left font-medium">
                  Position
                </th>
                {MONTH_LABELS.map((m) => (
                  <th
                    key={m}
                    className="border-b border-white/10 px-1 py-2 text-center font-medium"
                  >
                    {m}
                  </th>
                ))}
                <th className="border-b border-white/10 px-2 py-2 text-right font-medium">
                  Total
                </th>
                <th className="border-b border-white/10 px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((draw) => {
                const amounts = normalizeAmounts12(draw.amounts)
                const total = amounts.reduce((s, n) => s + n, 0)
                return (
                  <tr key={draw.id} className="border-t border-white/5">
                    <td className="sticky left-0 z-10 bg-[#0f141b] px-2 py-1.5 align-middle">
                      <input
                        className="input box-border !w-full !min-w-0 !py-1 !text-xs"
                        placeholder="e.g. Vacation"
                        value={draw.name}
                        onChange={(e) =>
                          onUpsertDraw({ ...draw, name: e.target.value })
                        }
                      />
                    </td>
                    {amounts.map((amt, i) => (
                      <td key={i} className="px-1 py-1.5 align-middle">
                        <input
                          className="input box-border !w-full !min-w-0 !px-1 !py-1 !text-[11px] text-right tabular-nums"
                          inputMode="decimal"
                          placeholder="—"
                          defaultValue={
                            amt > 0 ? formatInputNumber(amt, 2) : ''
                          }
                          key={`${draw.id}-${i}-${amt}`}
                          onBlur={(e) => {
                            const raw = e.target.value.trim()
                            const next = [...normalizeAmounts12(draw.amounts)]
                            if (!raw) {
                              next[i] = 0
                            } else {
                              const v = parseMoney(raw)
                              if (v == null || v < 0) return
                              next[i] = v
                            }
                            onUpsertDraw({ ...draw, amounts: next })
                          }}
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right align-middle tabular-nums text-white/60">
                      {total > 0
                        ? formatMoney(total, INCOME_COST_CURRENCY)
                        : '—'}
                    </td>
                    <td className="px-1 py-1.5 text-center align-middle">
                      <button
                        type="button"
                        className="text-[11px] text-white/35 hover:text-red-300"
                        onClick={() => onRemoveDraw(draw.id)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function MonthlyBudgetView({
  scenario,
  lines,
  draws,
  savingsAccounts,
  onUpsertDraw,
  onRemoveDraw,
  onAddDraw,
}: Props) {
  const scenarioDraws = useMemo(
    () => drawsForScenario(draws, scenario.id),
    [draws, scenario.id],
  )
  const cashAccount = useMemo(
    () => getPermanentCashAccount(savingsAccounts),
    [savingsAccounts],
  )
  const priorYear = scenario.year - 1
  const openingCash = useMemo(
    () => (cashAccount ? yearEndBalance(cashAccount, priorYear) : 0),
    [cashAccount, priorYear],
  )
  const schedule = useMemo(
    () => buildMonthlySchedule(lines, scenario.id, draws, openingCash),
    [lines, scenario.id, draws, openingCash],
  )
  const totals = useMemo(
    () => scenarioTotals(lines, scenario.id),
    [lines, scenario.id],
  )
  const missingMonths = useMemo(
    () => oneTimeMissingMonthCount(lines, scenario.id),
    [lines, scenario.id],
  )
  const yearEndWorking = schedule[11]?.balance ?? 0
  const yearEndAfterDraws = schedule[11]?.balanceAfterDraws ?? 0
  const drawsYearTotal = schedule.reduce((s, r) => s + r.draw, 0)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Meta
          label={`Opening cash (Dec ${priorYear})`}
          value={formatMoney(openingCash, INCOME_COST_CURRENCY)}
          accent="text-emerald-300/90"
        />
        <Meta
          label="Annual income"
          value={formatMoney(totals.incomeYearly, INCOME_COST_CURRENCY)}
        />
        <Meta
          label="Annual cost"
          value={formatMoney(totals.costYearly, INCOME_COST_CURRENCY)}
        />
        <Meta
          label="Annual net"
          value={formatMoney(totals.netYearly, INCOME_COST_CURRENCY)}
          accent={totals.netYearly >= 0 ? 'text-emerald-400' : 'text-red-300'}
        />
        <Meta
          label="Year-end balance"
          value={formatMoney(yearEndWorking, INCOME_COST_CURRENCY)}
          accent={yearEndWorking >= 0 ? 'text-sky-300' : 'text-red-300'}
        />
        <Meta
          label="After draws (Dec)"
          value={formatMoney(yearEndAfterDraws, INCOME_COST_CURRENCY)}
          accent={yearEndAfterDraws >= 0 ? 'text-pink-300' : 'text-red-300'}
        />
      </div>

      <p className="text-[11px] text-white/40">
        Opening working balance = permanent <strong className="text-white/55">Cash</strong>{' '}
        savings account, year-end of {priorYear} (set under Savings → Actuals as{' '}
        {priorYear}-12). Budget income/cost and draws build on top of that.
      </p>

      {missingMonths > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100/90">
          {missingMonths} one-time position{missingMonths === 1 ? '' : 's'} have no month set —
          they still count in the annual budget but not here. Set Paid in / Received in on the
          Budget tab (full amount in that month only).
        </p>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-white/50">
          {scenario.year} · monthly cash flow
        </h3>
        <FullscreenChart title={`${scenario.year} · monthly cash flow`}>
          <MonthlyFlowChart schedule={schedule} />
        </FullscreenChart>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/45">
            <tr>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 text-right font-medium">Inflow</th>
              <th className="px-3 py-2 text-right font-medium">Outflow</th>
              <th className="px-3 py-2 text-right font-medium">Net</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
              <th className="px-3 py-2 text-right font-medium">Draws</th>
              <th className="px-3 py-2 text-right font-medium">After draws</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr key={row.month} className="border-t border-white/5 text-white/85">
                <td className="px-3 py-1.5 tabular-nums">{row.label}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-300/90">
                  {formatMoney(row.income, INCOME_COST_CURRENCY)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-amber-200/90">
                  {formatMoney(row.cost, INCOME_COST_CURRENCY)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums ${
                    row.net >= 0 ? 'text-white/80' : 'text-red-300/90'
                  }`}
                >
                  {formatMoney(row.net, INCOME_COST_CURRENCY)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right font-medium tabular-nums ${
                    row.balance >= 0 ? 'text-sky-300/90' : 'text-red-300'
                  }`}
                >
                  {formatMoney(row.balance, INCOME_COST_CURRENCY)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-violet-300/90">
                  {row.draw > 0
                    ? formatMoney(row.draw, INCOME_COST_CURRENCY)
                    : '—'}
                </td>
                <td
                  className={`px-3 py-1.5 text-right font-medium tabular-nums ${
                    row.balanceAfterDraws >= 0 ? 'text-pink-300/90' : 'text-red-300'
                  }`}
                >
                  {formatMoney(row.balanceAfterDraws, INCOME_COST_CURRENCY)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-white/15 bg-white/[0.03] text-xs font-medium text-white/70">
              <td className="px-3 py-2">Year total / end</td>
              <td className="px-3 py-2 text-right tabular-nums text-emerald-300/90">
                {formatMoney(
                  schedule.reduce((s, r) => s + r.income, 0),
                  INCOME_COST_CURRENCY,
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-amber-200/90">
                {formatMoney(
                  schedule.reduce((s, r) => s + r.cost, 0),
                  INCOME_COST_CURRENCY,
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatMoney(
                  schedule.reduce((s, r) => s + r.net, 0),
                  INCOME_COST_CURRENCY,
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-sky-300/90">
                {formatMoney(yearEndWorking, INCOME_COST_CURRENCY)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-violet-300/90">
                {formatMoney(drawsYearTotal, INCOME_COST_CURRENCY)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-pink-300/90">
                {formatMoney(yearEndAfterDraws, INCOME_COST_CURRENCY)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[11px] text-white/35">
        Budget inflows/outflows come from Income/Cost positions. Draws reduce the “After draws”
        balance only and never change annual budget net or deposits. Working balance starts from
        permanent Cash (Dec prior year).
      </p>

      <DrawsEditor
        draws={scenarioDraws}
        onUpsertDraw={onUpsertDraw}
        onRemoveDraw={onRemoveDraw}
        onAddDraw={onAddDraw}
      />

      {drawsYearTotal > 0 && (
        <p className="text-[11px] text-violet-300/80">
          Draws this year: {formatMoney(drawsYearTotal, INCOME_COST_CURRENCY)} (informative)
        </p>
      )}
    </div>
  )
}

function Meta({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className={`truncate text-sm font-semibold tabular-nums ${accent ?? 'text-white/90'}`}>
        {value}
      </div>
    </div>
  )
}
