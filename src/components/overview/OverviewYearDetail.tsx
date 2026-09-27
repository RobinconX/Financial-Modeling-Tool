import { Fragment } from 'react'
import { formatMoney, formatPercent } from '../../lib/format'
import {
  OVERVIEW_CURRENCY,
  portfolioBreakdownChfAtYear,
  sourceLabel,
  type OverviewBuildDeps,
  type OverviewChartRow,
} from '../../lib/overview'
import { runwayDrawnFromRow, type RunwayYearFlow } from '../../lib/runway'
import type { OverviewSeries } from '../../types'

type Props = {
  row: OverviewChartRow
  series: OverviewSeries[]
  deps: OverviewBuildDeps
  colorById: Map<string, string>
  flow: RunwayYearFlow | null
  onClose: () => void
}

function money(n: number): string {
  return formatMoney(n, OVERVIEW_CURRENCY)
}

function signed(n: number): string {
  if (!(Math.abs(n) > 0.005)) return money(0)
  return n < 0 ? `−${money(Math.abs(n))}` : `+${money(n)}`
}

export function OverviewYearDetail({
  row,
  series,
  deps,
  colorById,
  flow,
  onClose,
}: Props) {
  const enabled = series.filter((s) => s.enabled)
  const sections = enabled
    .map((s) => ({
      series: s,
      value: typeof row[s.id] === 'number' ? (row[s.id] as number) : 0,
    }))
    .filter((s) => Math.abs(s.value) > 0.005)
  const total = typeof row.total === 'number' ? row.total : sections.reduce((n, s) => n + s.value, 0)
  const drawn = runwayDrawnFromRow(row)
  const nameById = new Map(enabled.map((s) => [s.id, s.name.trim() || sourceLabel(s.type)]))

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{row.isNow ? 'Now' : row.label}</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/50">
            {row.isNow ? 'Live' : row.kind === 'projected' ? 'Projected' : 'Actual'}
          </span>
        </div>
        <button type="button" className="text-[11px] text-white/40 hover:text-white/70" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-[11px]">
          <thead className="text-white/35">
            <tr>
              <th className="py-0.5 pr-3 font-medium">Section</th>
              <th className="py-0.5 pr-3 font-medium">Type</th>
              <th className="py-0.5 pr-3 text-right font-medium">Value</th>
              <th className="py-0.5 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(({ series: s, value }) => {
              const lines =
                s.type === 'portfolio'
                  ? portfolioBreakdownChfAtYear(s, row.year, deps, { live: row.isNow })
                  : []
              return (
                <Fragment key={s.id}>
                  <tr className="text-white/80">
                    <td className="py-0.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ background: colorById.get(s.id) ?? '#94a3b8' }}
                        />
                        {s.name.trim() || sourceLabel(s.type)}
                      </span>
                    </td>
                    <td className="py-0.5 pr-3 text-white/40">{sourceLabel(s.type)}</td>
                    <td className="py-0.5 pr-3 text-right tabular-nums">{money(value)}</td>
                    <td className="py-0.5 text-right tabular-nums text-white/50">
                      {total > 0 ? formatPercent(value / total) : '—'}
                    </td>
                  </tr>
                  {lines.map((line, i) => (
                    <tr key={`${s.id}-${line.label}-${i}`} className="text-white/45">
                      <td className="py-0.5 pr-3 pl-5" colSpan={2}>
                        {line.label}
                        {line.kind === 'cash' ? (
                          <span className="ml-1 text-white/30">cash</span>
                        ) : null}
                      </td>
                      <td className="py-0.5 pr-3 text-right tabular-nums">
                        {money(line.valueChf)}
                      </td>
                      <td className="py-0.5 text-right tabular-nums">
                        {total > 0 ? formatPercent(line.valueChf / total) : '—'}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              )
            })}
            <tr className="border-t border-white/10 font-medium text-white">
              <td className="py-1 pr-3" colSpan={2}>
                Total
              </td>
              <td className="py-1 pr-3 text-right tabular-nums text-emerald-300/90">
                {money(total)}
              </td>
              <td className="py-1 text-right tabular-nums text-white/40">
                {total > 0 ? '100%' : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {flow ? <RunwayCalc flow={flow} colorById={colorById} /> : null}

      {!flow && (typeof row.__income === 'number' || typeof row.__draw === 'number') ? (
        <div className="mt-2 max-w-sm space-y-0.5 border-t border-white/10 pt-2 text-white/55">
          {typeof row.__income === 'number' ? <Line label="Income" value={money(row.__income)} /> : null}
          {typeof row.__draw === 'number' ? <Line label="Draw" value={money(row.__draw)} /> : null}
          {drawn.map((d) => (
            <Line
              key={d.id}
              label={nameById.get(d.id) ?? d.id}
              value={`−${money(d.amount)}`}
              indent
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function RunwayCalc({
  flow,
  colorById,
}: {
  flow: RunwayYearFlow
  colorById: Map<string, string>
}) {
  const start = flow.series.reduce((s, r) => s + r.start, 0)
  const growth = flow.series.reduce((s, r) => s + r.growth, 0)
  const inflow = flow.series.reduce((s, r) => s + r.inflow, 0)
  const surplus = flow.series.reduce((s, r) => s + r.surplus, 0)
  const end = flow.series.reduce((s, r) => s + r.end, 0)
  const fromLabel = flow.from === 'now' ? 'Now' : `end of ${flow.from}`
  const taken = flow.series.filter((s) => s.drawn > 0.005)
  const takenTotal = taken.reduce((s, r) => s + r.drawn, 0)

  return (
    <div className="mt-3 border-t border-white/10 pt-2">
      <p className="text-[11px] text-white/40">
        From {fromLabel}. Each pile grows, then new money is added. Draws come off in order.
      </p>
      <div className="mt-2 max-w-sm space-y-0.5 text-white/55">
        <Line label="Start" value={money(start)} />
        <Line label="Growth" value={signed(growth)} />
        <Line label="New money" value={signed(inflow)} />
        {surplus > 0.005 ? <Line label="Surplus to leftover" value={signed(surplus)} /> : null}
        {takenTotal > 0.005 ? <Line label="From assets" value={signed(-takenTotal)} /> : null}
        <Line label={`End of ${flow.year}`} value={money(end)} strong />
      </div>
      {(flow.income > 0.005 || flow.draw > 0.005) && (
        <div className="mt-2 max-w-sm space-y-0.5 border-t border-white/10 pt-2 text-white/45">
          <Line label="Income" value={money(flow.income)} />
          <Line label="Draw needed" value={money(flow.draw)} />
        </div>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-[11px]">
          <thead className="text-white/35">
            <tr>
              <th className="py-0.5 pr-3 font-medium">Pile</th>
              <th className="py-0.5 pr-3 font-medium">When</th>
              <th className="py-0.5 pr-3 text-right font-medium">Start</th>
              <th className="py-0.5 pr-3 text-right font-medium">Growth</th>
              <th className="py-0.5 pr-3 text-right font-medium">New</th>
              <th className="py-0.5 pr-3 text-right font-medium">Out</th>
              <th className="py-0.5 text-right font-medium">End</th>
            </tr>
          </thead>
          <tbody>
            {flow.series.map((s) => (
              <tr key={s.id} className="text-white/65">
                <td className="py-0.5 pr-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ background: colorById.get(s.id) ?? '#94a3b8' }}
                    />
                    {s.name}
                  </span>
                </td>
                <td className="py-0.5 pr-3 text-white/40">
                  {s.drawTiming === 'drawFirst' ? 'Before growth' : 'After growth'}
                </td>
                <td className="py-0.5 pr-3 text-right tabular-nums">{money(s.start)}</td>
                <td className="py-0.5 pr-3 text-right tabular-nums">{signed(s.growth)}</td>
                <td className="py-0.5 pr-3 text-right tabular-nums">{signed(s.inflow)}</td>
                <td className="py-0.5 pr-3 text-right tabular-nums text-rose-300/80">
                  {s.drawn > 0.005 ? `−${money(s.drawn)}` : money(0)}
                </td>
                <td className="py-0.5 text-right tabular-nums text-white/85">{money(s.end)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Line({
  label,
  value,
  indent,
  strong,
}: {
  label: string
  value: string
  indent?: boolean
  strong?: boolean
}) {
  return (
    <div className={`flex justify-between gap-3 ${indent ? 'pl-2' : ''} ${strong ? 'font-medium text-white/80' : ''}`}>
      <span className="truncate">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  )
}
