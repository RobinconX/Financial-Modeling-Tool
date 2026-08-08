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
  PORTFOLIO_ACTUAL_COLOR,
  PORTFOLIO_TOTAL_CHART_KEY,
  PORTFOLIO_TOTAL_COLOR,
  type PortfolioChartBreakdownRow,
  type PortfolioChartMode,
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
  chartMode?: PortfolioChartMode
  fromYear?: number
  toYear?: number
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
  keys: string[],
): PortfolioChartPoint {
  const safe = (n: unknown) =>
    typeof n === 'number' && Number.isFinite(n) ? n : 0
  const convert = (n: unknown) => {
    const v = safe(n)
    if (currency === 'USD' || usdToChf == null || usdToChf <= 0) return v
    return safe(toDisplay(v, currency, usdToChf))
  }
  const next: PortfolioChartPoint = {
    ...point,
    total: convert(point.total),
    cash: convert(point.cash),
    breakdown: (point.breakdown ?? []).map((r) => ({
      ...r,
      value: convert(r.value),
    })),
  }
  for (const key of keys) {
    next[key] = convert(point[key])
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
  chartMode = 'stacked',
  fromYear,
  toYear,
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
    try {
      const raw = buildPortfolioChartData(
        grid,
        portfolio,
        scenarios,
        new Date().getFullYear(),
        {
          mode: chartMode,
          fromYear,
          toYear,
          usdToChf,
        },
      )
      const keys = [
        ...equityRows.map((r) => r.key),
        'cash',
        PERPETUAL_GROWTH_CHART_KEY,
        PORTFOLIO_TOTAL_CHART_KEY,
      ]
      return raw.map((p) => convertPoint(p, activeCurrency, usdToChf, keys))
    } catch (err) {
      console.error('[PortfolioChart] failed to build chart data', err)
      return []
    }
  }, [
    grid,
    portfolio,
    scenarios,
    activeCurrency,
    usdToChf,
    equityRows,
    chartMode,
    fromYear,
    toYear,
  ])

  const hasCash =
    chartMode === 'stacked' &&
    data.some(
      (d) =>
        !d.isPerpetualGrowth &&
        !d.isActual &&
        typeof d.cash === 'number' &&
        d.cash !== 0,
    )

  const hasActuals = data.some((d) => d.isActual)
  const colorByKey = useMemo(() => {
    const map = new Map<string, string>()
    equityRows.forEach((row, i) => {
      map.set(row.key, HOLDING_COLORS[i % HOLDING_COLORS.length])
    })
    map.set('cash', CASH_COLOR)
    map.set(PERPETUAL_GROWTH_CHART_KEY, PERPETUAL_GROWTH_COLOR)
    map.set(PORTFOLIO_TOTAL_CHART_KEY, PORTFOLIO_TOTAL_COLOR)
    return map
  }, [equityRows])

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

  useEffect(() => {
    if (!hover || !panelRef.current) return
    const el = panelRef.current
    const id = requestAnimationFrame(() => {
      if (el.scrollHeight > el.clientHeight + 1) {
        el.focus({ preventScroll: true })
      }
    })
    return () => cancelAnimationFrame(id)
  }, [hover?.point.xKey, hover?.point.total, areaSize.h])

  if (data.length < 1 || !data.some((d) => d.total > 0 || d.isNow)) {
    return (
      <div className="flex h-64 w-full items-center justify-center text-sm text-white/40">
        Portfolio value chart appears once you have shares, cash, or actuals
      </div>
    )
  }

  const barCategoryGap = data.length > 14 ? '12%' : data.length > 8 ? '18%' : '28%'
  const maxBarSize = data.length > 14 ? 28 : data.length > 8 ? 40 : 52

  const tickKeys = new Set<string>(['now'])
  const yearPoints = data.filter((d) => !d.isNow)
  const tickStep = yearPoints.length <= 12 ? 1 : yearPoints.length <= 24 ? 2 : 5
  yearPoints.forEach((d, i) => {
    if (i % tickStep === 0 || i === yearPoints.length - 1 || d.isCurrentYear || d.isActual) {
      tickKeys.add(String(d.xKey))
    }
  })
  // Always label Now (sits between past and current year)
  tickKeys.add('now')

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

            {chartMode === 'total' ? (
              <Bar
                dataKey={PORTFOLIO_TOTAL_CHART_KEY}
                name="Portfolio"
                stackId="portfolio"
                fill={PORTFOLIO_TOTAL_COLOR}
                isAnimationActive={false}
                maxBarSize={maxBarSize}
                radius={[3, 3, 0, 0]}
              >
                {data.map((entry) => (
                  <Cell
                    key={`total-${entry.xKey}`}
                    fill={
                      entry.isNow
                        ? '#94a3b8'
                        : entry.isActual
                          ? PORTFOLIO_ACTUAL_COLOR
                          : entry.isPerpetualGrowth
                            ? PERPETUAL_GROWTH_COLOR
                            : PORTFOLIO_TOTAL_COLOR
                    }
                    fillOpacity={entry.isEmpty ? 0 : entry.isActual ? 0.95 : 0.9}
                    stroke={
                      entry.isNow || entry.isActual
                        ? 'rgba(255,255,255,0.4)'
                        : undefined
                    }
                    strokeWidth={entry.isNow || entry.isActual ? 1.5 : 0}
                  />
                ))}
              </Bar>
            ) : (
              <>
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
                        fill={
                          entry.isActual
                            ? PORTFOLIO_ACTUAL_COLOR
                            : HOLDING_COLORS[i % HOLDING_COLORS.length]
                        }
                        fillOpacity={
                          entry.isEmpty || entry.isPerpetualGrowth
                            ? 0
                            : entry.isActual
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
                {/* Past-year actuals in stacked mode use total key */}
                {hasActuals && (
                  <Bar
                    dataKey={PORTFOLIO_TOTAL_CHART_KEY}
                    name="Actual"
                    stackId="portfolio"
                    fill={PORTFOLIO_ACTUAL_COLOR}
                    isAnimationActive={false}
                    maxBarSize={maxBarSize}
                    radius={[3, 3, 0, 0]}
                  >
                    {data.map((entry) => (
                      <Cell
                        key={`act-${entry.xKey}`}
                        fill={PORTFOLIO_ACTUAL_COLOR}
                        fillOpacity={entry.isActual ? 0.95 : 0}
                        stroke={entry.isActual ? 'rgba(255,255,255,0.4)' : undefined}
                        strokeWidth={entry.isActual ? 1.5 : 0}
                      />
                    ))}
                  </Bar>
                )}
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
                        fillOpacity={
                          entry.isEmpty || entry.isPerpetualGrowth || entry.isActual
                            ? 0
                            : 1
                        }
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
              </>
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
            onMouseLeave={() => setHover(null)}
          >
            <HoverPanel
              point={hover.point}
              currency={activeCurrency}
              colorByKey={colorByKey}
            />
          </div>
        )}
      </div>

      {hasActuals ? (
        <p className="mt-1 shrink-0 text-[10px] text-white/35">
          <span className="text-amber-300/90">Amber</span> = manual actuals (year-end)
        </p>
      ) : null}
    </div>
  )
}

function HoverPanel({
  point,
  currency,
  colorByKey,
}: {
  point: PortfolioChartPoint
  currency: DisplayCurrency
  colorByKey: Map<string, string>
}) {
  const title = point.isNow
    ? 'Now — live positions'
    : point.isActual
      ? `${point.yearLabel} — actual (year-end)`
      : point.isPerpetualGrowth
        ? `${point.yearLabel} — growth`
        : `${point.yearLabel}`
  const rows = (point.breakdown ?? []).filter((r) => r.value !== 0)
  return (
    <div className="p-3 text-xs">
      <div className="mb-2 border-b border-white/10 pb-2">
        <div className="font-semibold text-white/90">{title}</div>
        <div className="mt-0.5 tabular-nums text-emerald-300">
          {formatMoney(point.total, currency)}
        </div>
        {point.isActual && (
          <div className="mt-0.5 text-[10px] text-amber-300/80">Manual end-of-month actual</div>
        )}
      </div>
      <ul className="space-y-1">
        {rows.map((r: PortfolioChartBreakdownRow) => (
          <li key={r.key} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{
                  background:
                    r.key === 'actual'
                      ? PORTFOLIO_ACTUAL_COLOR
                      : (colorByKey.get(r.key) ?? '#94a3b8'),
                }}
              />
              <span className="truncate text-white/70">
                {r.ticker}
                {r.shares != null ? ` · ${r.shares} sh` : ''}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-white/85">
              {formatMoney(r.value, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function computePanelStyle(barX: number, areaW: number, areaH: number): CSSProperties {
  if (areaW <= 0) return { left: PANEL_EDGE, top: PANEL_TOP, width: PANEL_WIDTH, maxHeight: 200 }
  const preferRight = barX + PANEL_GAP + PANEL_WIDTH <= areaW - PANEL_EDGE
  const left = preferRight
    ? Math.min(barX + PANEL_GAP, areaW - PANEL_WIDTH - PANEL_EDGE)
    : Math.max(PANEL_EDGE, barX - PANEL_GAP - PANEL_WIDTH)
  const maxHeight = Math.max(120, areaH - PANEL_TOP - PANEL_EDGE)
  return {
    left,
    top: PANEL_TOP,
    width: PANEL_WIDTH,
    maxHeight,
  }
}


