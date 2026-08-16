import { formatMoney } from '../../lib/format'
import { OVERVIEW_CURRENCY, sourceLabel } from '../../lib/overview'
import type { RunwayYearFlow } from '../../lib/runway'

type Props = {
  selectedXKey: string | null
  flow: RunwayYearFlow | null
  colorById: Map<string, string>
  onClear: () => void
}

function money(n: number): string {
  return formatMoney(n, OVERVIEW_CURRENCY)
}

function signed(n: number): string {
  if (!(Math.abs(n) > 0.005)) return money(0)
  return n < 0 ? `−${money(Math.abs(n))}` : `+${money(n)}`
}

function sum(flow: RunwayYearFlow, key: keyof Pick<
  RunwayYearFlow['series'][number],
  'start' | 'growth' | 'inflow' | 'surplus' | 'drawn' | 'end'
>): number {
  return flow.series.reduce((s, row) => s + row[key], 0)
}

export function RunwayYearFlowPanel({ selectedXKey, flow, colorById, onClear }: Props) {
  if (selectedXKey == null) {
    return (
      <p className="text-[11px] text-white/40">
        Click a year on the chart to see how that bar was built (start, growth, new money, draws).
      </p>
    )
  }

  if (selectedXKey === 'now') {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-white/80">Now</span>
          <button type="button" className="text-[11px] text-white/40 hover:text-white/70" onClick={onClear}>
            Close
          </button>
        </div>
        <p className="mt-1 text-white/45">
          Live starting pile. Click a projected year to walk through growth, new money, and draws.
        </p>
      </div>
    )
  }

  if (!flow) {
    return (
      <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-white/80">{selectedXKey}</span>
          <button type="button" className="text-[11px] text-white/40 hover:text-white/70" onClick={onClear}>
            Close
          </button>
        </div>
        <p className="mt-1 text-white/45">
          Past years are the modeled net-worth stack. Runway grow and spend start at Now.
        </p>
      </div>
    )
  }

  const start = sum(flow, 'start')
  const growth = sum(flow, 'growth')
  const inflow = sum(flow, 'inflow')
  const surplus = sum(flow, 'surplus')
  const end = sum(flow, 'end')
  const fromLabel = flow.from === 'now' ? 'Now' : `end of ${flow.from}`
  const showSurplus = surplus > 0.005
  const taken = flow.series.filter((s) => s.drawn > 0.005)
  const takenTotal = taken.reduce((s, row) => s + row.drawn, 0)

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-white/85">
          {flow.year}
          <span className="ml-2 font-normal text-white/40">from {fromLabel}</span>
        </div>
        <button type="button" className="text-[11px] text-white/40 hover:text-white/70" onClick={onClear}>
          Close
        </button>
      </div>
      <p className="mt-1 text-[11px] text-white/40">
        Piles pay in draw order (top first). Before / after is when that pile is tapped relative
        to its own growth — it does not skip ahead of piles above it.
      </p>

      <div className="mt-2 max-w-sm space-y-0.5 text-white/55">
        <Row label="Start" value={money(start)} />
        <Row label="Growth" value={signed(growth)} />
        <Row label="New money" value={signed(inflow)} />
        {showSurplus ? <Row label="Surplus to leftover" value={signed(surplus)} /> : null}
        {taken.length > 0 ? (
          <>
            <Row label="From assets" value={signed(-takenTotal)} valueClass="text-rose-300/85" />
            {taken.map((s) => (
              <Row
                key={s.id}
                label={`${s.name} · ${s.drawTiming === 'drawFirst' ? 'before growth' : 'after growth'}`}
                value={`−${money(s.drawn)}`}
                indent
                valueClass="text-rose-300/80"
              />
            ))}
          </>
        ) : null}
        <Row label={`End of ${flow.year}`} value={money(end)} strong />
      </div>

      {(flow.income > 0.005 || flow.draw > 0.005) && (
        <div className="mt-2 max-w-sm space-y-0.5 border-t border-white/10 pt-2 text-white/45">
          <Row label="Income" value={money(flow.income)} />
          <Row label="Draw needed" value={money(flow.draw)} />
        </div>
      )}

      {flow.series.length > 0 ? (
        <div className="mt-2 overflow-x-auto border-t border-white/10 pt-2">
          <table className="w-full min-w-[34rem] text-left text-[11px]">
            <thead className="text-white/35">
              <tr>
                <th className="py-0.5 pr-3 font-medium">Pile</th>
                <th className="py-0.5 pr-3 font-medium">When</th>
                <th className="py-0.5 pr-3 text-right font-medium">Start</th>
                <th className="py-0.5 pr-3 text-right font-medium">Growth</th>
                <th className="py-0.5 pr-3 text-right font-medium">New</th>
                {showSurplus ? <th className="py-0.5 pr-3 text-right font-medium">Surplus</th> : null}
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
                      <span className="truncate">{s.name}</span>
                      <span className="text-white/30">({sourceLabel(s.type)})</span>
                    </span>
                  </td>
                  <td className="py-0.5 pr-3 whitespace-nowrap text-white/40">
                    {s.drawTiming === 'drawFirst' ? 'Before growth' : 'After growth'}
                  </td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{money(s.start)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{signed(s.growth)}</td>
                  <td className="py-0.5 pr-3 text-right tabular-nums">{signed(s.inflow)}</td>
                  {showSurplus ? (
                    <td className="py-0.5 pr-3 text-right tabular-nums">{signed(s.surplus)}</td>
                  ) : null}
                  <td className="py-0.5 pr-3 text-right tabular-nums text-rose-300/80">
                    {s.drawn > 0.005 ? `−${money(s.drawn)}` : money(0)}
                  </td>
                  <td className="py-0.5 text-right tabular-nums text-white/85">{money(s.end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function Row({
  label,
  value,
  indent,
  strong,
  valueClass,
}: {
  label: string
  value: string
  indent?: boolean
  strong?: boolean
  valueClass?: string
}) {
  return (
    <div className={`flex justify-between gap-3 ${indent ? 'pl-2' : ''} ${strong ? 'font-medium text-white/80' : ''}`}>
      <span className={indent ? 'truncate text-white/40' : ''}>{label}</span>
      <span className={`shrink-0 tabular-nums ${valueClass ?? ''}`}>{value}</span>
    </div>
  )
}
