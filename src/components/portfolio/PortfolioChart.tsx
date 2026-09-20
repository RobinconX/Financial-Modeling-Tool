import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  useXAxisScale,
  useYAxisScale,
} from 'recharts'
import { formatMoney, formatPercent } from '../../lib/format'
import { fromDisplay, toDisplay } from '../../lib/fx'
import { investedForRoiDisplay, simpleRoi } from '../../lib/portfolioContributions'
import type {
  DisplayCurrency,
  PortfolioContributionsState,
  PortfolioGrid,
  PortfolioActualsState,
  SavedPortfolio,
} from '../../types'
import {
  buildPortfolioChartData,
  cashAtYear,
  getOpeningCash,
  PERPETUAL_GROWTH_CHART_KEY,
  PERPETUAL_GROWTH_COLOR,
  PORTFOLIO_ACTUAL_COLOR,
  PORTFOLIO_TOTAL_CHART_KEY,
  PORTFOLIO_TOTAL_COLOR,
  PORTFOLIO_TARGET_CHART_KEY,
  PORTFOLIO_TARGET_COLOR,
  targetCompoundValue,
  type PortfolioChartBreakdownRow,
  type PortfolioChartMode,
  type PortfolioChartPoint,
} from '../../lib/portfolio'
import { PortfolioYearDetail, pointTitle, sliceColor } from './PortfolioYearDetail'

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
const ROI_LINE_COLOR = '#e879f9'

const PANEL_WIDTH = 280
const PANEL_GAP = 14
const PANEL_EDGE = 8
/** Keep year bars / x-axis hoverable under the tooltip. */
const PANEL_BOTTOM_CLEAR = 88

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
  contributions?: PortfolioContributionsState | null
  actuals?: PortfolioActualsState | null
  /** Show cash / invested on hover and a % line chart */
  showCashInvested?: boolean
  /** Overlay ROI % on the bars (right axis) */
  showRoi?: boolean
  /** Overlay target compound path on the value axis */
  showTarget?: boolean
  /** Grow to parent height (fullscreen overlay) */
  fillContainer?: boolean
}

type HoverState = {
  point: PortfolioChartPoint
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

/** Right-axis domain: 0–100 for cash/invested; expand when ROI is outside that. */
function pctAxisDomain(
  data: PortfolioChartPoint[],
  showRoi: boolean,
  showCashInvested: boolean,
): [number, number] {
  if (!showRoi) return [0, 100]
  let lo = 0
  let hi = showCashInvested ? 100 : 0
  for (const d of data) {
    const v = d.roiPct
    if (typeof v !== 'number' || !Number.isFinite(v)) continue
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  if (hi === lo) return showCashInvested ? [0, 100] : [0, 20]
  const pad = Math.max(5, (hi - lo) * 0.1)
  return [Math.floor(lo < 0 ? lo - pad : lo), Math.ceil(hi + pad)]
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
  contributions = null,
  actuals = null,
  showCashInvested = false,
  showRoi = false,
  showTarget = false,
  fillContainer = false,
}: Props) {
  const activeCurrency: DisplayCurrency =
    displayCurrency ?? (currency === 'CHF' ? 'CHF' : 'USD')

  const [hover, setHover] = useState<HoverState | null>(null)
  const [pin, setPin] = useState({ x: 0, y: 0 })
  const [selectedXKey, setSelectedXKey] = useState<string | null>(null)
  const chartAreaRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [areaSize, setAreaSize] = useState({ w: 0, h: 0 })
  const hoverKeyRef = useRef<string | null>(null)
  const cursorRef = useRef({ x: 0, y: 0 })
  const panelHoverRef = useRef(false)

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
          actuals,
        },
      )
      const keys = [
        ...equityRows.map((r) => r.key),
        'cash',
        PERPETUAL_GROWTH_CHART_KEY,
        PORTFOLIO_TOTAL_CHART_KEY,
      ]
      const currentYear = new Date().getFullYear()
      const cashRow = grid.rows.find((r) => r.kind === 'cash')
      return raw.map((p) => {
        const next = convertPoint(p, activeCurrency, usdToChf, keys)
        let cashUsd: number | null = null
        if (p.isNow) {
          cashUsd = getOpeningCash(portfolio)
        } else if (!p.isActual && !p.isEmpty && p.year != null) {
          const i = grid.years.indexOf(p.year)
          const fromGrid = i >= 0 ? cashRow?.values[i] : null
          if (fromGrid != null && Number.isFinite(fromGrid)) {
            cashUsd = fromGrid
          } else if (p.year >= currentYear) {
            cashUsd = cashAtYear(portfolio, p.year, scenarios, currentYear)
          }
        }
        const total = typeof next.total === 'number' ? next.total : 0
        if (cashUsd == null || !(total > 0)) {
          next.cashSharePct = null
          next.investedSharePct = null
        } else {
          const cashDisp = toDisplay(cashUsd, activeCurrency, usdToChf)
          next.cashSharePct = (cashDisp / total) * 100
          next.investedSharePct = ((total - cashDisp) / total) * 100
          next.cashDisp = cashDisp
        }
        next.roiPct = null
        if (!p.isEmpty && contributions != null && Number.isFinite(total)) {
          const year = p.year ?? currentYear
          const invested = investedForRoiDisplay(
            contributions,
            year,
            activeCurrency,
            usdToChf,
            portfolio,
            currentYear,
            p.isNow,
          )
          const r =
            invested != null && invested > 0 ? simpleRoi(total, invested) : null
          if (r) next.roiPct = r.roi * 100
        }
        next[PORTFOLIO_TARGET_CHART_KEY] = null
        if (showTarget && portfolio.targetCompound) {
          const tc = portfolio.targetCompound
          const amountUsd = fromDisplay(tc.amount, tc.currency, usdToChf)
          const usd = targetCompoundValue(
            amountUsd,
            tc.ratePercent,
            tc.year ?? currentYear,
            currentYear,
            p,
            portfolio,
            grid.lastStatedYear ?? currentYear,
            contributions,
            usdToChf,
          )
          next[PORTFOLIO_TARGET_CHART_KEY] =
            usd != null ? toDisplay(usd, activeCurrency, usdToChf) : null
        }
        return next
      })
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
    contributions,
    actuals,
    showTarget,
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
  const yearTotals = useMemo(() => {
    const m = new Map<number, number>()
    for (const p of data) {
      if (p.isNow || p.year == null || !Number.isFinite(p.total)) continue
      m.set(p.year, p.total)
    }
    return m
  }, [data])
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

  const tickKeys = useMemo(() => {
    const keys = new Set<string>(['now'])
    const yearPoints = data.filter((d) => !d.isNow)
    const tickStep = yearPoints.length <= 12 ? 1 : yearPoints.length <= 24 ? 2 : 5
    yearPoints.forEach((d, i) => {
      if (i % tickStep === 0 || i === yearPoints.length - 1 || d.isCurrentYear || d.isActual) {
        keys.add(String(d.xKey))
      }
    })
    return keys
  }, [data])

  function resolvePoint(
    state: {
      isTooltipActive?: boolean
      activeLabel?: string | number
      activeTooltipIndex?: number | string | unknown
      activeIndex?: number | string | unknown
      activeCoordinate?: { x?: number; y?: number }
    },
    requireTooltip = true,
  ): HoverState | null {
    if (requireTooltip && !state?.isTooltipActive) return null

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
    return { point }
  }

  const panelStyle = hover
    ? computePanelStyle(pin.x, pin.y, areaSize.w, areaSize.h)
    : null

  const handleChartHover = useCallback(
    (state: Parameters<typeof resolvePoint>[0]) => {
      const next = resolvePoint(state)
      const key = next?.point.xKey ?? null
      if (!next) {
        if (panelHoverRef.current) return
        hoverKeyRef.current = null
        setHover(null)
        return
      }
      if (key === hoverKeyRef.current) return
      hoverKeyRef.current = key
      const c = cursorRef.current
      setPin(
        c.x !== 0 || c.y !== 0
          ? c
          : {
              x: state.activeCoordinate?.x ?? 0,
              y: state.activeCoordinate?.y ?? 0,
            },
      )
      setHover(next)
    },
    // resolvePoint closes over latest `data`; skip setState when the year is unchanged.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data],
  )

  const handleChartClick = useCallback(
    (state: Parameters<typeof resolvePoint>[0]) => {
      const next = resolvePoint(state, false)
      if (!next) return
      setSelectedXKey((cur) => (cur === next.point.xKey ? null : next.point.xKey))
    },
    [data],
  )

  useEffect(() => {
    if (!selectedXKey) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedXKey(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedXKey])

  const selectedPoint = selectedXKey
    ? (data.find((d) => d.xKey === selectedXKey) ?? null)
    : null

  useEffect(() => {
    if (selectedXKey && !data.some((d) => d.xKey === selectedXKey)) setSelectedXKey(null)
  }, [data, selectedXKey])

  function clearHover() {
    hoverKeyRef.current = null
    setHover(null)
  }

  return (
    <div
      className={
        fillContainer
          ? 'flex h-full min-h-0 w-full flex-col'
          : 'flex w-full flex-col'
      }
    >
      <div
        className={
          fillContainer
            ? 'flex min-h-0 w-full flex-1 flex-col'
            : 'flex h-80 w-full flex-col'
        }
      >
      <div
        ref={chartAreaRef}
        className="relative min-h-0 w-full flex-1 cursor-pointer overflow-hidden outline-none [&_svg]:outline-none"
        onMouseDown={(e) => {
          if (panelRef.current?.contains(e.target as Node)) return
          e.preventDefault()
        }}
        onMouseMove={(e) => {
          if (panelRef.current?.contains(e.target as Node)) return
          const r = e.currentTarget.getBoundingClientRect()
          cursorRef.current = { x: e.clientX - r.left, y: e.clientY - r.top }
        }}
        onMouseLeave={(e) => {
          if (panelRef.current?.contains(e.relatedTarget as Node)) return
          clearHover()
        }}
      >
        <PortfolioBarsPlot
          data={data}
          equityRows={equityRows}
          chartMode={chartMode}
          activeCurrency={activeCurrency}
          barCategoryGap={barCategoryGap}
          maxBarSize={maxBarSize}
          tickKeys={tickKeys}
          hasActuals={hasActuals}
          hasCash={hasCash}
          hasPerpetualGrowth={hasPerpetualGrowth}
          showCashInvested={showCashInvested}
          showRoi={showRoi}
          showTarget={showTarget}
          selectedXKey={selectedXKey}
          onHover={handleChartHover}
          onClick={handleChartClick}
        />

        {hover && panelStyle && (
          <div
            ref={panelRef}
            tabIndex={0}
            role="dialog"
            aria-label={`Breakdown for ${hover.point.yearLabel}`}
            className="absolute z-30 overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-[#121820]/97 shadow-2xl outline-none backdrop-blur-sm focus:ring-1 focus:ring-emerald-500/40"
            style={panelStyle}
            onMouseEnter={() => {
              panelHoverRef.current = true
            }}
            onMouseLeave={() => {
              panelHoverRef.current = false
            }}
            onWheel={(e) => e.stopPropagation()}
          >
            <HoverPanel
              point={hover.point}
              currency={activeCurrency}
              colorByKey={colorByKey}
              contributions={contributions}
              usdToChf={usdToChf}
              portfolio={portfolio}
              showCashInvested={showCashInvested}
              showTarget={showTarget}
            />
          </div>
        )}
      </div>

      {hasActuals || showRoi || showTarget ? (
        <p className="mt-1 shrink-0 text-[10px] text-white/35">
          {hasActuals ? (
            <>
              <span className="text-amber-300/90">Amber</span> = manual actuals (year-end)
            </>
          ) : null}
          {hasActuals && (showRoi || showTarget) ? (
            <span className="text-white/25"> · </span>
          ) : null}
          {showRoi ? (
            <>
              <span className="text-fuchsia-300/90">Fuchsia</span> = ROI
            </>
          ) : null}
          {showRoi && showTarget ? <span className="text-white/25"> · </span> : null}
          {showTarget ? (
            <>
              <span className="text-red-300/90">Red</span> = target compound
            </>
          ) : null}
        </p>
      ) : null}
      </div>

      {selectedPoint ? (
        <div className="mt-3 shrink-0">
          <PortfolioYearDetail
            point={selectedPoint}
            currency={activeCurrency}
            colorByKey={colorByKey}
            contributions={contributions}
            usdToChf={usdToChf}
            portfolio={portfolio}
            lastStatedYear={grid.lastStatedYear}
            yearTotals={yearTotals}
            onClose={() => setSelectedXKey(null)}
          />
        </div>
      ) : (
        <p className="mt-2 shrink-0 text-[11px] text-white/35">
          Click a year for a pie and full breakdown.
        </p>
      )}
    </div>
  )
}

function HoverPanel({
  point,
  currency,
  colorByKey,
  contributions,
  usdToChf,
  portfolio,
  showCashInvested,
  showTarget = false,
}: {
  point: PortfolioChartPoint
  currency: DisplayCurrency
  colorByKey: Map<string, string>
  contributions: PortfolioContributionsState | null
  usdToChf: number | null
  portfolio: SavedPortfolio
  showCashInvested: boolean
  showTarget?: boolean
}) {
  const title = pointTitle(point)
  const rows = (point.breakdown ?? []).filter((r) => r.value !== 0)
  const total = point.total
  const year = point.year ?? new Date().getFullYear()
  const invested =
    contributions != null
      ? investedForRoiDisplay(
          contributions,
          year,
          currency,
          usdToChf,
          portfolio,
          new Date().getFullYear(),
          point.isNow,
        )
      : null
  const roi =
    invested != null && invested > 0 && Number.isFinite(point.total)
      ? simpleRoi(point.total, invested)
      : null
  return (
    <div className="p-3 text-xs">
      <div className="mb-2 border-b border-white/10 pb-2">
        <div className="font-semibold text-white/90">{title}</div>
        <div className="mt-0.5 tabular-nums text-emerald-300">
          {formatMoney(point.total, currency)}
        </div>
        {roi ? (
          <div className="mt-1.5 space-y-0.5 text-white/55">
            <div className="flex justify-between gap-4">
              <span>Invested</span>
              <span className="tabular-nums">{formatMoney(roi.invested, currency)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Gain</span>
              <span className={`tabular-nums ${roi.gain >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'}`}>
                {formatMoney(roi.gain, currency)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>ROI</span>
              <span className={`tabular-nums ${roi.roi >= 0 ? 'text-emerald-300/90' : 'text-rose-300/90'}`}>
                {formatPercent(roi.roi)}
              </span>
            </div>
          </div>
        ) : null}
        {showTarget && typeof point[PORTFOLIO_TARGET_CHART_KEY] === 'number' ? (
          <div className="mt-1.5 space-y-0.5 text-white/55">
            <div className="flex justify-between gap-4">
              <span>Target</span>
              <span className="tabular-nums text-red-300/90">
                {formatMoney(point[PORTFOLIO_TARGET_CHART_KEY] as number, currency)}
              </span>
            </div>
            {Number.isFinite(point.total) ? (
              <div className="flex justify-between gap-4">
                <span>vs target</span>
                <span
                  className={`tabular-nums ${
                    point.total - (point[PORTFOLIO_TARGET_CHART_KEY] as number) >= 0
                      ? 'text-emerald-300/90'
                      : 'text-rose-300/90'
                  }`}
                >
                  {formatMoney(
                    point.total - (point[PORTFOLIO_TARGET_CHART_KEY] as number),
                    currency,
                  )}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
        {showCashInvested &&
        typeof point.cashSharePct === 'number' &&
        typeof point.investedSharePct === 'number' ? (
          <div className="mt-1.5 text-white/70">
            <span className="text-emerald-300/90">{point.investedSharePct.toFixed(0)}% invested</span>
            <span className="text-white/30"> · </span>
            <span className="text-sky-300/90">{point.cashSharePct.toFixed(0)}% cash</span>
          </div>
        ) : null}
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
                style={{ background: sliceColor(r, colorByKey) }}
              />
              <span className="truncate text-white/70">
                {r.ticker}
                {r.shares != null ? ` · ${r.shares} sh` : ''}
              </span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
              <span className="text-white/85">{formatMoney(r.value, currency)}</span>
              {total > 0 ? (
                <span className="ml-2 text-white/40">{formatPercent(r.value / total)}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function yearSelectPaint(
  entry: PortfolioChartPoint,
  selectedXKey: string | null,
  baseOpacity: number,
): { fillOpacity: number } {
  const hidden = baseOpacity <= 0
  const dim = selectedXKey != null && entry.xKey !== selectedXKey
  return {
    fillOpacity: hidden ? 0 : dim ? baseOpacity * 0.28 : baseOpacity,
  }
}

function SelectedBarOutline({
  selectedXKey,
  data,
  maxBarSize,
}: {
  selectedXKey: string | null
  data: PortfolioChartPoint[]
  maxBarSize: number
}) {
  const xScale = useXAxisScale()
  const yScale = useYAxisScale('usd')
  if (selectedXKey == null || !xScale || !yScale) return null
  const point = data.find((d) => d.xKey === selectedXKey)
  const total = typeof point?.total === 'number' ? point.total : 0
  if (!point || point.isEmpty || !(total > 0)) return null
  const xStart = xScale(selectedXKey, { position: 'start' })
  const xEnd = xScale(selectedXKey, { position: 'end' })
  const xMid = xScale(selectedXKey, { position: 'middle' })
  if (xStart == null || xEnd == null || xMid == null) return null
  const width = Math.max(1, Math.min(Math.abs(xEnd - xStart), maxBarSize))
  const x = xMid - width / 2
  const yTop = yScale(total)
  const yBot = yScale(0)
  if (yTop == null || yBot == null) return null
  const y = Math.min(yTop, yBot)
  const height = Math.abs(yBot - yTop)
  if (height < 1) return null
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill="none"
      stroke="rgba(255,255,255,0.85)"
      strokeWidth={2}
      rx={3}
      pointerEvents="none"
    />
  )
}

type BarsPlotProps = {
  data: PortfolioChartPoint[]
  equityRows: PortfolioGrid['rows']
  chartMode: PortfolioChartMode
  activeCurrency: DisplayCurrency
  barCategoryGap: string
  maxBarSize: number
  tickKeys: Set<string>
  hasActuals: boolean
  hasCash: boolean
  hasPerpetualGrowth: boolean
  showCashInvested: boolean
  showRoi: boolean
  showTarget: boolean
  selectedXKey: string | null
  onHover: (state: {
    isTooltipActive: boolean
    activeLabel?: string | number
    activeTooltipIndex?: number | string | unknown
    activeIndex?: number | string | unknown
    activeCoordinate?: { x?: number; y?: number }
  }) => void
  onClick: (state: {
    isTooltipActive?: boolean
    activeLabel?: string | number
    activeTooltipIndex?: number | string | unknown
    activeIndex?: number | string | unknown
    activeCoordinate?: { x?: number; y?: number }
  }) => void
}

const PortfolioBarsPlot = memo(function PortfolioBarsPlot({
  data,
  equityRows,
  chartMode,
  activeCurrency,
  barCategoryGap,
  maxBarSize,
  tickKeys,
  hasActuals,
  hasCash,
  hasPerpetualGrowth,
  showCashInvested,
  showRoi,
  showTarget,
  selectedXKey,
  onHover,
  onClick,
}: BarsPlotProps) {
  const showPctAxis = showCashInvested || showRoi
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={data}
        margin={{ top: 8, right: showPctAxis ? 42 : 12, left: 4, bottom: 4 }}
        barCategoryGap={barCategoryGap}
        onMouseMove={onHover}
        onClick={onClick}
        style={{ cursor: 'pointer', outline: 'none' }}
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
          yAxisId="usd"
          stroke="rgba(255,255,255,0.35)"
          tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
          tickLine={false}
          tickFormatter={(v: number) => formatMoney(v, activeCurrency)}
          width={72}
          axisLine={false}
        />
        {showPctAxis ? (
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={pctAxisDomain(data, showRoi, showCashInvested)}
            tick={{ fill: 'rgba(255,255,255,0.55)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={42}
            tickFormatter={(v: number) => `${Math.round(v)}%`}
          />
        ) : null}
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.06)' }}
          content={() => null}
          isAnimationActive={false}
        />

        {chartMode === 'total' ? (
          <Bar
            yAxisId="usd"
            dataKey={PORTFOLIO_TOTAL_CHART_KEY}
            name="Portfolio"
            stackId="portfolio"
            fill={PORTFOLIO_TOTAL_COLOR}
            isAnimationActive={false}
            stroke="none"
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
                {...yearSelectPaint(
                  entry,
                  selectedXKey,
                  entry.isEmpty ? 0 : entry.isActual ? 0.95 : 0.9,
                )}
              />
            ))}
          </Bar>
        ) : (
          <>
            {equityRows.map((row, i) => (
              <Bar
                yAxisId="usd"
                key={row.key}
                dataKey={row.key}
                name={row.label}
                stackId="portfolio"
                fill={HOLDING_COLORS[i % HOLDING_COLORS.length]}
                isAnimationActive={false}
                stroke="none"
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
                    {...yearSelectPaint(
                      entry,
                      selectedXKey,
                      entry.isEmpty || entry.isPerpetualGrowth
                        ? 0
                        : entry.isActual
                          ? 0
                          : entry.isNow
                            ? 1
                            : entry.isCurrentYear
                              ? 0.95
                              : 0.88,
                    )}
                  />
                ))}
              </Bar>
            ))}
            {hasActuals && (
              <Bar
                yAxisId="usd"
                dataKey={PORTFOLIO_TOTAL_CHART_KEY}
                name="Actual"
                stackId="portfolio"
                fill={PORTFOLIO_ACTUAL_COLOR}
                isAnimationActive={false}
                stroke="none"
                maxBarSize={maxBarSize}
                radius={[3, 3, 0, 0]}
              >
                {data.map((entry) => (
                  <Cell
                    key={`act-${entry.xKey}`}
                    fill={PORTFOLIO_ACTUAL_COLOR}
                    {...yearSelectPaint(
                      entry,
                      selectedXKey,
                      entry.isActual ? 0.95 : 0,
                    )}
                  />
                ))}
              </Bar>
            )}
            {hasCash && (
              <Bar
                yAxisId="usd"
                dataKey="cash"
                name="Cash"
                stackId="portfolio"
                fill={CASH_COLOR}
                isAnimationActive={false}
                stroke="none"
                maxBarSize={maxBarSize}
                radius={hasPerpetualGrowth ? [0, 0, 0, 0] : [3, 3, 0, 0]}
              >
                {data.map((entry) => (
                  <Cell
                    key={`cash-${entry.xKey}`}
                    fill={entry.isNow ? NOW_CASH_COLOR : CASH_COLOR}
                    {...yearSelectPaint(
                      entry,
                      selectedXKey,
                      entry.isEmpty || entry.isPerpetualGrowth || entry.isActual ? 0 : 1,
                    )}
                  />
                ))}
              </Bar>
            )}
            {hasPerpetualGrowth && (
              <Bar
                yAxisId="usd"
                dataKey={PERPETUAL_GROWTH_CHART_KEY}
                name="Growth"
                stackId="portfolio"
                fill={PERPETUAL_GROWTH_COLOR}
                isAnimationActive={false}
                stroke="none"
                maxBarSize={maxBarSize}
                radius={[3, 3, 0, 0]}
              >
                {data.map((entry) => (
                  <Cell
                    key={`growth-${entry.xKey}`}
                    fill={PERPETUAL_GROWTH_COLOR}
                    {...yearSelectPaint(
                      entry,
                      selectedXKey,
                      entry.isPerpetualGrowth ? 0.92 : 0,
                    )}
                  />
                ))}
              </Bar>
            )}
          </>
        )}
        {showCashInvested ? (
          <>
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="investedSharePct"
              name="Invested %"
              stroke="#34d399"
              strokeWidth={2}
              dot={{ r: 2.5, fill: '#34d399' }}
              connectNulls={false}
              isAnimationActive={false}
            />
            <Line
              yAxisId="pct"
              type="monotone"
              dataKey="cashSharePct"
              name="Cash %"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={{ r: 2.5, fill: '#38bdf8' }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </>
        ) : null}
        {showRoi ? (
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="roiPct"
            name="ROI"
            stroke={ROI_LINE_COLOR}
            strokeWidth={2}
            dot={{ r: 2.5, fill: ROI_LINE_COLOR }}
            connectNulls={false}
            isAnimationActive={false}
          />
        ) : null}
        {showTarget ? (
          <Line
            yAxisId="usd"
            type="monotone"
            dataKey={PORTFOLIO_TARGET_CHART_KEY}
            name="Target"
            stroke={PORTFOLIO_TARGET_COLOR}
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={{ r: 2.5, fill: PORTFOLIO_TARGET_COLOR }}
            connectNulls
            isAnimationActive={false}
          />
        ) : null}
        <SelectedBarOutline
          selectedXKey={selectedXKey}
          data={data}
          maxBarSize={maxBarSize}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
})

/** Fixed size, always at the top; bottom of the chart stays free to pick another year. */
function computePanelStyle(
  cx: number,
  _cy: number,
  areaW: number,
  areaH: number,
): CSSProperties {
  const w = areaW > 0 ? areaW : 640
  const h = areaH > 0 ? areaH : 320
  const panelW = Math.min(PANEL_WIDTH, Math.max(200, w - PANEL_EDGE * 2))
  const maxHeight = Math.min(
    220,
    Math.max(120, h - PANEL_EDGE - PANEL_BOTTOM_CLEAR),
  )
  const gap = PANEL_GAP

  let left = cx < w / 2 ? cx + gap : cx - panelW - gap
  left = Math.max(PANEL_EDGE, Math.min(left, w - panelW - PANEL_EDGE))

  return { left, top: PANEL_EDGE, width: panelW, maxHeight }
}


