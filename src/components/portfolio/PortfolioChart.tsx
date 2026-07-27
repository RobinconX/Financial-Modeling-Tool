import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
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
import { toDisplay } from '../../lib/fx'
import type { DisplayCurrency, PortfolioGrid, SavedPortfolio } from '../../types'
import {
  buildPortfolioChartData,
  PERPETUAL_GROWTH_CHART_KEY,
  PERPETUAL_GROWTH_COLOR,
  type PortfolioChartBreakdownRow,
  type PortfolioChartPoint,
} from '../../lib/portfolio'

const HOLDING_COLORS = [
  '#38bdf8',
  '#a78bfa',
  '#fbbf24',
  '#f472b6',
  '#2dd4bf',
  '#fb923c',
  '#818cf8',
  '#e879f9',
]
const CASH_COLOR = '#64748b'
const NOW_CASH_COLOR = '#94a3b8'

const PANEL_WIDTH = 280
const PANEL_GAP = 10
const PANEL_TOP = 8
const PANEL_EDGE = 8

type Props = {
  grid: PortfolioGrid
  portfolio: SavedPortfolio
  scenarios?: import('../../types').SavedScenario[]
  /** @deprecated use displayCurrency */
  currency?: string
  displayCurrency?: DisplayCurrency
  usdToChf?: number | null
  /** Grow to parent height (fullscreen overlay) */
  fillContainer?: boolean
}

type HoverState = {
  point: PortfolioChartPoint
  /** Bar category X (chart-local, from Recharts activeCoordinate) */
  barX: number
}

function convertPoint(
  point: PortfolioChartPoint,
  currency: DisplayCurrency,
  usdToChf: number | null,
  equityKeys: string[],
): PortfolioChartPoint {
  if (currency === 'USD' || usdToChf == null || usdToChf <= 0) return point
  const next: PortfolioChartPoint = {
    ...point,
    total: toDisplay(point.total, currency, usdToChf),
    breakdown: (point.breakdown ?? []).map((r) => ({
      ...r,
      value: toDisplay(r.value, currency, usdToChf),
    })),
  }
  if (typeof point.cash === 'number') {
    next.cash = toDisplay(point.cash, currency, usdToChf)
  }
  for (const key of equityKeys) {
    const v = point[key]
    if (typeof v === 'number') next[key] = toDisplay(v, currency, usdToChf)
  }
  return next
}

export function PortfolioChart({
  grid,
  portfolio,
  scenarios = [],
  currency = 'USD',
  displayCurrency,
  usdToChf = null,
  fillContainer = false,
}: Props) {
  const activeCurrency: DisplayCurrency =
    displayCurrency ?? (currency === 'CHF' ? 'CHF' : 'USD')

  const [hover, setHover] = useState<HoverState | null>(null)
  const chartAreaRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 })

  const equityRows = useMemo(
    () => grid.rows.filter((r) => r.kind === 'equity'),
    [grid.rows],
  )
  const hasPerpetualGrowth = useMemo(
    () => grid.rows.some((r) => r.kind === 'growth'),
    [grid.rows],
  )

  const data = useMemo(() => {
    const raw = buildPortfolioChartData(grid, portfolio, scenarios)
    const keys = [
      ...equityRows.map((r) => r.key),
      ...(hasPerpetualGrowth ? [PERPETUAL_GROWTH_CHART_KEY] : []),
    ]
    return raw.map((p) => convertPoint(p, activeCurrency, usdToChf, keys))
  }, [grid, portfolio, scenarios, activeCurrency, usdToChf, equityRows, hasPerpetualGrowth])
  const hasCash =
    getCurrentCashSafe(portfolio) > 0 ||
    data.some((d) => typeof d.cash === 'number' && d.cash !== 0 && !d.isPerpetualGrowth)

  const colorByKey = useMemo(() => {
    const map = new Map<string, string>()
    equityRows.forEach((row, i) => {
      map.set(row.key, HOLDING_COLORS[i % HOLDING_COLORS.length])
    })
    map.set('cash', CASH_COLOR)
    map.set(PERPETUAL_GROWTH_CHART_KEY, PERPETUAL_GROWTH_COLOR)
    return map
  }, [equityRows])

  // Keep chart area size for clamping the hover panel
  useLayoutEffect(() => {
    const el = chartAreaRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setAreaSize({ w: r.width, h: r.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [fillContainer, data.length])

  // When the panel is taller than available space, focus it so wheel-scroll works
  useEffect(() => {
    if (!hover || !panelRef.current) return
    const el = panelRef.current
    // Next frame after layout
    const id = requestAnimationFrame(() => {
      if (el.scrollHeight > el.clientHeight + 1) {
        el.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [hover?.point.xKey, hover?.point.total, areaSize.h])

  if (data.length < 1 || !data.some((d) => d.total > 0)) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
        Portfolio value chart appears once you have shares or cash
      </div>
    )
  }

  const barCategoryGap = data.length > 14 ? '12%' : data.length > 8 ? '18%' : '28%'
  const maxBarSize = data.length > 14 ? 28 : data.length > 8 ? 40 : 52

  const tickKeys = new Set<string>(['now'])
  const yearPoints = data.filter((d) => !d.isNow)
  const tickStep = yearPoints.length <= 12 ? 1 : yearPoints.length <= 24 ? 2 : 5
  yearPoints.forEach((d, i) => {
    if (i % tickStep === 0 || i === yearPoints.length - 1 || d.isCurrentYear) {
      tickKeys.add(String(d.xKey))
    }
  })

  function resolvePoint(state: {
    isTooltipActive: boolean
    activeLabel?: string | number
    activeTooltipIndex?: number | string | unknown
    activeIndex?: number | string | unknown
    activeCoordinate?: { x?: number; y?: number }
  }): HoverState | null {
    if (!state?.isTooltipActive) return null

    const byLabel =
      state.activeLabel != null
        ? data.find((d) => d.xKey === String(state.activeLabel))
        : undefined
    const idx =
      typeof state.activeTooltipIndex === 'number'
        ? state.activeTooltipIndex
        : typeof state.activeIndex === 'number'
          ? state.activeIndex
          : -1
    const byIndex = idx >= 0 ? data[idx] : undefined
    const point = byLabel ?? byIndex
    if (!point) return null

    const barX =
      typeof state.activeCoordinate?.x === 'number' ? state.activeCoordinate.x : 0
    return { point, barX }
  }

  const panelStyle = hover ? computePanelStyle(hover.barX, areaSize.w, areaSize.h) : null

  return (
    <div
      className={
        fillContainer
          ? 'flex h-full min-h-0 w-full flex-col'
          : 'flex h-80 w-full flex-col'
      }
    >
      <div
        ref={chartAreaRef}
        className="relative min-h-0 w-full flex-1 overflow-hidden"
        onMouseLeave={() => setHover(null)}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 12, left: 4, bottom: 4 }}
            barCategoryGap={barCategoryGap}
            onMouseMove={(state) => {
              const next = resolvePoint(state)
              setHover(next)
            }}
          >
            <CartesianGrid
              stroke="rgba(255,255,255,0.06)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="xKey"
              stroke="rgba(255,255,255,0.35)"
              tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
              interval={0}
              tickFormatter={(key: string) => {
                if (!tickKeys.has(key)) return ''
                if (key === 'now') return 'Now'
                return key
              }}
            />
            <YAxis
              stroke="rgba(255,255,255,0.35)"
              tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
              tickLine={false}
              tickFormatter={(v: number) => formatMoney(v, activeCurrency)}
              width={72}
              axisLine={false}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.06)' }}
              content={() => null}
              isAnimationActive={false}
            />

            {equityRows.map((row, i) => (
              <Bar
                key={row.key}
                dataKey={row.key}
                name={row.label}
                stackId="portfolio"
                fill={HOLDING_COLORS[i % HOLDING_COLORS.length]}
                isAnimationActive={false}
                maxBarSize={maxBarSize}
              >
                {data.map((entry) => (
                  <Cell
                    key={`${row.key}-${entry.xKey}`}
                    fill={HOLDING_COLORS[i % HOLDING_COLORS.length]}
                    fillOpacity={
                      entry.isEmpty || entry.isPerpetualGrowth
                        ? 0
                        : entry.isNow
                          ? 1
                          : entry.isCurrentYear
                            ? 0.95
                            : 0.88
                    }
                    stroke={entry.isNow ? 'rgba(255,255,255,0.35)' : undefined}
                    strokeWidth={entry.isNow ? 1 : 0}
                  />
                ))}
              </Bar>
            ))}
            {hasCash && (
              <Bar
                dataKey="cash"
                name="Cash"
                stackId="portfolio"
                fill={CASH_COLOR}
                isAnimationActive={false}
                maxBarSize={maxBarSize}
                radius={hasPerpetualGrowth ? [0, 0, 0, 0] : [3, 3, 0, 0]}
              >
                {data.map((entry) => (
                  <Cell
                    key={`cash-${entry.xKey}`}
                    fill={entry.isNow ? NOW_CASH_COLOR : CASH_COLOR}
                    fillOpacity={entry.isEmpty || entry.isPerpetualGrowth ? 0 : 1}
                    stroke={entry.isNow ? 'rgba(255,255,255,0.35)' : undefined}
                    strokeWidth={entry.isNow ? 1 : 0}
                  />
                ))}
              </Bar>
            )}
            {hasPerpetualGrowth && (
              <Bar
                dataKey={PERPETUAL_GROWTH_CHART_KEY}
                name="Growth"
                stackId="portfolio"
                fill={PERPETUAL_GROWTH_COLOR}
                isAnimationActive={false}
                maxBarSize={maxBarSize}
                radius={[3, 3, 0, 0]}
              >
                {data.map((entry) => (
                  <Cell
                    key={`growth-${entry.xKey}`}
                    fill={PERPETUAL_GROWTH_COLOR}
                    fillOpacity={entry.isPerpetualGrowth ? 0.92 : 0}
                  />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>

        {hover && panelStyle && (
          <div
            ref={panelRef}
            tabIndex={0}
            role="dialog"
            aria-label={`Breakdown for ${hover.point.yearLabel}`}
            className="absolute z-30 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#121820]/97 shadow-2xl outline-none backdrop-blur-sm focus:ring-1 focus:ring-emerald-500/40"
            style={panelStyle}
            onWheel={(e) => {
              // Keep wheel on the panel; don't scroll the page behind
              e.stopPropagation()
            }}
          >
            <HoverBreakdownPanel
              point={hover.point}
              currency={activeCurrency}
              colorByKey={colorByKey}
            />
          </div>
        )}
      </div>
      {!fillContainer && (
        <p className="mt-1 shrink-0 text-center text-[11px] text-white/35">
          <span className="text-white/55">Now</span> = live holdings + current cash · later years =
          projections · <span className="text-emerald-400/80">green</span> = perpetual growth from
          last total
        </p>
      )}
    </div>
  )
}

/**
 * Place the panel top/right of the hovered bar. Flip left if it would clip the right edge.
 * Height is capped to the chart area so overflow scrolls inside the panel only.
 */
function computePanelStyle(
  barX: number,
  areaW: number,
  areaH: number,
): CSSProperties {
  const w = areaW > 0 ? areaW : 640
  const h = areaH > 0 ? areaH : 320
  const panelW = Math.min(PANEL_WIDTH, Math.max(200, w - PANEL_EDGE * 2))

  // Prefer right of the bar center
  let left = barX + PANEL_GAP
  if (left + panelW > w - PANEL_EDGE) {
    // Flip to left of bar
    left = barX - panelW - PANEL_GAP
  }
  // Clamp into chart area
  left = Math.max(PANEL_EDGE, Math.min(left, w - panelW - PANEL_EDGE))

  const maxHeight = Math.max(140, h - PANEL_TOP - PANEL_EDGE)

  return {
    left,
    top: PANEL_TOP,
    width: panelW,
    maxHeight,
  }
}

function HoverBreakdownPanel({
  point,
  currency,
  colorByKey,
}: {
  point: PortfolioChartPoint
  currency: string
  colorByKey: Map<string, string>
}) {
  if (point.isEmpty) {
    return (
      <div className="px-4 py-3">
        <p className="text-sm font-medium text-white/80">Year {point.yearLabel}</p>
        <p className="mt-1 text-xs text-white/40">No projection for this year</p>
      </div>
    )
  }

  const rows = (point.breakdown ?? []).filter(
    (r) => r.value !== 0 || (r.shares != null && r.shares !== 0),
  )
  const title = point.isNow
    ? 'Now — live positions'
    : point.isCurrentYear
      ? `Year ${point.yearLabel} — end of year`
      : `Year ${point.yearLabel}`

  return (
    <div className="px-3 py-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-white/40">No holdings this period</p>
      ) : (
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-[#121820]">
            <tr className="text-[10px] uppercase tracking-wider text-white/35">
              <th className="pb-1.5 pr-3 font-medium">Ticker</th>
              <th className="pb-1.5 pr-3 text-right font-medium">Shares</th>
              <th className="pb-1.5 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <BreakdownRow key={r.key} row={r} currency={currency} color={colorByKey.get(r.key)} />
            ))}
          </tbody>
        </table>
      )}
      <div className="sticky bottom-0 mt-3 flex items-baseline justify-between gap-4 border-t border-white/10 bg-[#121820] pt-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/45">
          Total
        </span>
        <span className="text-lg font-bold tabular-nums tracking-tight text-emerald-400">
          {formatMoney(point.total, currency)}
        </span>
      </div>
    </div>
  )
}

function BreakdownRow({
  row,
  currency,
  color,
}: {
  row: PortfolioChartBreakdownRow
  currency: string
  color?: string
}) {
  return (
    <tr className="border-t border-white/[0.04]">
      <td className="py-1 pr-3">
        <span className="inline-flex items-center gap-1.5 font-medium text-white/85">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-sm"
            style={{ background: color ?? (row.isCash ? CASH_COLOR : '#94a3b8') }}
          />
          {row.ticker}
        </span>
      </td>
      <td className="py-1 pr-3 text-right tabular-nums text-white/55">
        {row.shares == null
          ? '—'
          : row.shares.toLocaleString(undefined, { maximumFractionDigits: 4 })}
      </td>
      <td className="py-1 text-right tabular-nums text-white/80">
        {formatMoney(row.value, currency)}
      </td>
    </tr>
  )
}

function getCurrentCashSafe(portfolio: SavedPortfolio): number {
  return portfolio.currentCash != null && portfolio.currentCash > 0 ? portfolio.currentCash : 0
}
