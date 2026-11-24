import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  DisplayCurrency,
  PortfolioContributionsState,
  PortfolioTrade,
  PortfolioTradesState,
  SavedPortfolio,
  SavedScenario,
} from '../../types'
import { formatMoney, formatPrice } from '../../lib/format'
import { amountToDisplay } from '../../lib/fx'
import {
  clearTradesForPortfolio,
  downloadPortfolioTradesExport,
} from '../../lib/portfolioTradesExport'
import type { PerfDisplayContext } from '../../lib/portfolioTradeFx'
import { tradesInDisplayCurrency } from '../../lib/portfolioTradeFx'
import {
  computePortfolioPerformance,
  formatSnapshotMarkSummary,
  newPortfolioTrade,
  todayIsoDate,
  tradesForPortfolio,
  type SymbolPerformance,
} from '../../lib/portfolioTrades'
import { optionLabel, parseOccSymbol } from '../../lib/optionContract'
import { tradeInstrument } from '../../lib/portfolioTradeLedger'
import {
  computeOptionsPerformanceAggregate,
  optionTradesForReturnMarkers,
  tradedEquitySymbolsFromTrades,
  tradesForReturnProgression,
  tradesMatchingPerformanceScope,
} from '../../lib/portfolioOptionsPerformance'
import { equityHistorySymbolsFromTrades } from '../../lib/equityHistorySymbols'
import {
  buildFullReturnProgression,
  computeBookTimeWeightedReturn,
} from '../../lib/portfolioReturnProgression'
import { buildReturnChartOptionMarkers } from '../../lib/returnChartOptionMarkers'
import {
  computeHoldingCostStats,
  computePortfolioActivityRollup,
  computeTimeWeightedReturn,
  computeTradeActivity,
  formatHoldingPeriod,
  partitionPerformanceSymbolsByOpen,
  type PortfolioActivityRollup,
  type TwrResult,
  type TradeActivityStats,
} from '../../lib/portfolioPerformanceStats'
import {
  computeCapitalContributionStats,
  computeMoneyWeightedReturn,
  computePeakPortfolioValue,
  computePortfolioTerminalNav,
  mwrReasonLabel,
  twrReasonLabel,
  type MwrResult,
} from '../../lib/portfolioReturnMetrics'
import {
  PortfolioReturnChart,
  type ReturnChartMode,
} from './PortfolioReturnChart'
import {
  fetchPriceHistoryClient,
  isHistoryFresh,
  type CachedPriceHistory,
} from '../../lib/priceHistory'
import {
  loadCachedPriceHistory,
  saveCachedPriceHistory,
} from '../../lib/priceHistoryStorage'
import { FeatureGuideButton } from '../guides/FeatureGuideButton'
import { PortfolioTradeDrawer } from './PortfolioTradeDrawer'
import { PortfolioTradeImportModal } from './PortfolioTradeImportModal'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { cashTabBalanceDisplayAsOf } from '../../lib/portfolioCashTab'
import {
  buildPerformanceMetricBreakdown,
  type PerformanceMetricId,
} from '../../lib/portfolioPerformanceBreakdown'
import { PerformanceMetricDrawer } from './PerformanceMetricDrawer'
import {
  PerformanceFxMetricBadge,
  PerformanceFxWarningsBanner,
} from './PerformanceFxWarningsBanner'
import {
  hasPerformanceFxWarnings,
  metricUsesTradeDateFx,
} from '../../lib/performanceFxWarnings'
import {
  collectTradeDates,
  portfolioNeedsTradeDateFx,
  parseTradeFxPrefetchKey,
  prefetchUsdChfRatesForTradeDates,
  tradeFxPrefetchKey,
} from '../../lib/historicalFx'

type Props = {
  portfolio: SavedPortfolio
  tradesState: PortfolioTradesState
  tradesError: string | null
  scenarios: SavedScenario[]
  displayCurrency?: DisplayCurrency
  usdToChf?: number | null
  onSaveTrade: (trade: PortfolioTrade) => boolean
  onDeleteTrade: (tradeId: string) => boolean
  logTradeSeed?: { symbol: string; holdingId?: string } | null
  onClearLogTradeSeed?: () => void
  onFocusHolding?: (holdingId: string) => void
  onReplaceTrades: (next: PortfolioTradesState) => boolean
  contributions?: PortfolioContributionsState | null
  currentYear?: number
}

function pct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function pnlClass(v: number): string {
  if (v > 0) return 'text-emerald-300/90'
  if (v < 0) return 'text-red-300/90'
  return 'text-white/70'
}

function twrLabel(r: TwrResult | undefined): string {
  if (!r || r.status === 'na') return '—'
  if (r.status === 'unavailable') return 'Unavailable'
  if (r.twr == null) return '—'
  return pct(r.twr)
}

function StatsCardButton({
  className,
  onClick,
  children,
}: {
  className?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button type="button" className={`${className ?? ''} cursor-pointer transition hover:border-white/20`} onClick={onClick}>
      {children}
    </button>
  )
}

const SNAPSHOT_RETURN_LABEL_ID = 'snapshot-return-today-label'

export type SnapshotReturnStatsCardProps = {
  totalPnl: number
  snapshotReturnPct: number | null
  currentNet: number
  grossBuys: number
  snapshotTwr: TwrResult
  snapshotMwr: MwrResult
  snapshotMarkNote: string | null
  perfFxWarningActive: boolean
  fmt: (n: number) => string
  onOpenMetric: (id: PerformanceMetricId) => void
}

export function SnapshotReturnStatsCard({
  totalPnl,
  snapshotReturnPct,
  currentNet,
  grossBuys,
  snapshotTwr,
  snapshotMwr,
  snapshotMarkNote,
  perfFxWarningActive,
  fmt,
  onOpenMetric,
}: SnapshotReturnStatsCardProps) {
  return (
    <div
      role="group"
      aria-labelledby={SNAPSHOT_RETURN_LABEL_ID}
      className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 text-left"
    >
      <p
        id={SNAPSHOT_RETURN_LABEL_ID}
        className="text-[10px] font-semibold uppercase tracking-wide text-white/45"
      >
        Snapshot return (today)
      </p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <button
          type="button"
          className={`text-2xl font-semibold tabular-nums underline decoration-transparent hover:decoration-white/25 ${pnlClass(totalPnl)}`}
          onClick={() => onOpenMetric('totalPnl')}
        >
          {fmt(totalPnl)}
        </button>
        <button
          type="button"
          className="text-lg font-semibold tabular-nums text-white/90 underline decoration-white/20 hover:decoration-white/50"
          onClick={() => onOpenMetric('snapshotReturn')}
        >
          {pct(snapshotReturnPct)}
          {perfFxWarningActive && metricUsesTradeDateFx('snapshotReturn') ? (
            <PerformanceFxMetricBadge />
          ) : null}
        </button>
        <button
          type="button"
          className="text-xs text-white/40 underline decoration-white/10 hover:text-white/60"
          onClick={() => onOpenMetric('netCapital')}
        >
          on {fmt(currentNet)} net capital
          {perfFxWarningActive && metricUsesTradeDateFx('netCapital') ? (
            <PerformanceFxMetricBadge />
          ) : null}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums text-white/70">
        <button
          type="button"
          className="hover:text-white"
          onClick={() => onOpenMetric('twr')}
        >
          <span className="text-white/45">TWR </span>
          {twrReasonLabel(snapshotTwr)}
          {perfFxWarningActive && metricUsesTradeDateFx('twr') ? (
            <PerformanceFxMetricBadge />
          ) : null}
        </button>
        <button
          type="button"
          className="hover:text-white"
          onClick={() => onOpenMetric('mwr')}
        >
          <span className="text-white/45">MWR (annualized) </span>
          {mwrReasonLabel(snapshotMwr)}
          {perfFxWarningActive && metricUsesTradeDateFx('mwr') ? (
            <PerformanceFxMetricBadge />
          ) : null}
        </button>
        <button
          type="button"
          className="text-white/40 hover:text-white/70"
          onClick={() => onOpenMetric('grossBuys')}
        >
          gross buys {fmt(grossBuys)}
        </button>
      </div>
      {snapshotMarkNote ? (
        <p className="mt-1.5 text-[11px] text-white/50">{snapshotMarkNote}</p>
      ) : null}
    </div>
  )
}

function CompactStats({
  rows,
}: {
  rows: {
    label: string
    value: string
    onClick?: () => void
    fxApprox?: boolean
  }[]
}) {
  if (rows.length === 0) return null
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3 lg:grid-cols-4">
      {rows.map((r) => (
        <div key={r.label}>
          {r.onClick ? (
            <button
              type="button"
              className="w-full text-left transition hover:opacity-90"
              onClick={r.onClick}
            >
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                {r.label}
                {r.fxApprox ? <PerformanceFxMetricBadge /> : null}
              </dt>
              <dd className="mt-0.5 tabular-nums text-white/85">{r.value}</dd>
            </button>
          ) : (
            <>
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                {r.label}
                {r.fxApprox ? <PerformanceFxMetricBadge /> : null}
              </dt>
              <dd className="mt-0.5 tabular-nums text-white/85">{r.value}</dd>
            </>
          )}
        </div>
      ))}
    </dl>
  )
}

export function PortfolioPerformancePanel({
  portfolio,
  tradesState,
  tradesError,
  scenarios,
  displayCurrency = 'USD',
  usdToChf = null,
  onSaveTrade,
  onDeleteTrade,
  logTradeSeed,
  onClearLogTradeSeed,
  onFocusHolding,
  onReplaceTrades,
  contributions = null,
  currentYear = new Date().getFullYear(),
}: Props) {
  const fmt = useCallback(
    (amount: number) => formatMoney(amount, displayCurrency),
    [displayCurrency],
  )
  const fmtStoredMoney = useCallback(
    (amount: number, amountCurrency: PortfolioTrade['currency']) =>
      formatMoney(
        amountToDisplay(amount, amountCurrency ?? 'USD', displayCurrency, usdToChf),
        displayCurrency,
      ),
    [displayCurrency, usdToChf],
  )
  const fmtStoredPrice = useCallback(
    (amount: number, amountCurrency: PortfolioTrade['currency']) =>
      formatPrice(
        amountToDisplay(amount, amountCurrency ?? 'USD', displayCurrency, usdToChf),
        displayCurrency,
      ),
    [displayCurrency, usdToChf],
  )
  const portfolioTrades = useMemo(
    () => tradesForPortfolio(tradesState, portfolio.id),
    [tradesState, portfolio.id],
  )
  const tradedEquitySymbols = useMemo(
    () => tradedEquitySymbolsFromTrades(portfolioTrades),
    [portfolioTrades],
  )
  const [scopeSymbol, setScopeSymbol] = useState<string | null>(null)
  const [histories, setHistories] = useState<Record<string, CachedPriceHistory>>({})
  const [histLoading, setHistLoading] = useState<Set<string>>(new Set())
  const [metricDetailId, setMetricDetailId] = useState<PerformanceMetricId | null>(null)

  useEffect(() => {
    setScopeSymbol(null)
  }, [portfolio.id])

  useEffect(() => {
    if (scopeSymbol && !tradedEquitySymbols.includes(scopeSymbol)) {
      setScopeSymbol(null)
    }
  }, [scopeSymbol, tradedEquitySymbols])

  const scopedTrades = useMemo(
    () =>
      scopeSymbol
        ? tradesMatchingPerformanceScope(portfolioTrades, scopeSymbol)
        : portfolioTrades,
    [portfolioTrades, scopeSymbol],
  )

  const historyPoints = useMemo(() => {
    const out: Record<string, { date: string; close: number }[]> = {}
    for (const [k, v] of Object.entries(histories)) {
      out[k] = v.points ?? []
    }
    return out
  }, [histories])

  const quoteCurrencyBySymbol = useMemo(() => {
    const out: Record<string, DisplayCurrency> = {}
    for (const [sym, h] of Object.entries(histories)) {
      out[sym] = h.currency === 'CHF' ? 'CHF' : 'USD'
    }
    return out
  }, [histories])

  const progressionTrades = useMemo(
    () => tradesForReturnProgression(portfolioTrades, scopeSymbol),
    [portfolioTrades, scopeSymbol],
  )

  const capitalTrades = progressionTrades

  const capitalTradeFxFingerprint = useMemo(
    () =>
      capitalTrades
        .map(
          (t) =>
            `${t.id}\t${t.tradeDate}\t${t.currency ?? ''}\t${t.feesCurrency ?? ''}\t${t.fees ?? 0}`,
        )
        .sort()
        .join('\n'),
    [capitalTrades],
  )

  const tradeFxPrefetchKeyValue = useMemo(() => {
    if (!portfolioNeedsTradeDateFx(capitalTrades, displayCurrency)) return ''
    return tradeFxPrefetchKey(collectTradeDates(capitalTrades), displayCurrency)
  }, [displayCurrency, capitalTradeFxFingerprint, capitalTrades])

  const [usdToChfByTradeDate, setUsdToChfByTradeDate] = useState<
    Record<string, number>
  >({})
  const [tradeFxWarnings, setTradeFxWarnings] = useState<string[]>([])

  const usdToChfForTradeFxRef = useRef(usdToChf)
  usdToChfForTradeFxRef.current = usdToChf

  useEffect(() => {
    if (!tradeFxPrefetchKeyValue) {
      setUsdToChfByTradeDate({})
      setTradeFxWarnings([])
      return
    }
    let cancelled = false
    const dates = parseTradeFxPrefetchKey(tradeFxPrefetchKeyValue)?.dates ?? []
    void prefetchUsdChfRatesForTradeDates(
      dates,
      usdToChfForTradeFxRef.current ?? null,
    ).then((res) => {
      if (cancelled) return
      setUsdToChfByTradeDate(res.ratesByDate)
      setTradeFxWarnings(res.warnings)
    })
    return () => {
      cancelled = true
    }
  }, [tradeFxPrefetchKeyValue])

  const perfCtx = useMemo(
    (): PerfDisplayContext => ({
      displayCurrency,
      usdToChf: usdToChf ?? null,
      quoteCurrencyBySymbol,
      usdToChfByTradeDate:
        Object.keys(usdToChfByTradeDate).length > 0 ? usdToChfByTradeDate : undefined,
      fxWarnings: tradeFxWarnings.length > 0 ? tradeFxWarnings : undefined,
    }),
    [displayCurrency, usdToChf, quoteCurrencyBySymbol, usdToChfByTradeDate, tradeFxWarnings],
  )

  const asOfDate = todayIsoDate()

  const summary = useMemo(
    () =>
      computePortfolioPerformance(
        scopedTrades,
        portfolio,
        scenarios,
        historyPoints,
        asOfDate,
        perfCtx,
      ),
    [scopedTrades, portfolio, scenarios, historyPoints, perfCtx, asOfDate],
  )

  const capitalStats = useMemo(
    () => computeCapitalContributionStats(capitalTrades, asOfDate, perfCtx),
    [capitalTrades, asOfDate, perfCtx],
  )

  const cashTabToday = useMemo(
    () =>
      cashTabBalanceDisplayAsOf(
        portfolio,
        scenarios,
        asOfDate,
        displayCurrency,
        usdToChf ?? null,
        currentYear,
      ),
    [portfolio, scenarios, asOfDate, displayCurrency, usdToChf, currentYear],
  )

  const terminalNav = useMemo(
    () => computePortfolioTerminalNav(summary, cashTabToday.amount),
    [summary, cashTabToday.amount],
  )

  const peakPortfolio = useMemo(
    () =>
      computePeakPortfolioValue(
        capitalTrades,
        portfolio,
        scenarios,
        historyPoints,
        asOfDate,
        perfCtx,
        currentYear,
      ),
    [
      capitalTrades,
      portfolio,
      scenarios,
      historyPoints,
      asOfDate,
      perfCtx,
      currentYear,
    ],
  )

  const snapshotReturnPct = useMemo(() => {
    if (capitalStats.peakNet > 0 && Number.isFinite(summary.totalPnl)) {
      return summary.totalPnl / capitalStats.peakNet
    }
    return null
  }, [capitalStats.peakNet, summary.totalPnl])

  const tradesBySymbol = useMemo(() => {
    const m = new Map<string, PortfolioTrade[]>()
    for (const t of scopedTrades) {
      const list = m.get(t.symbol) ?? []
      list.push(t)
      m.set(t.symbol, list)
    }
    return m
  }, [scopedTrades])

  const equityTradesBySymbol = useMemo(() => {
    const m = new Map<string, PortfolioTrade[]>()
    for (const t of scopedTrades) {
      if (tradeInstrument(t) === 'option') continue
      const list = m.get(t.symbol) ?? []
      list.push(t)
      m.set(t.symbol, list)
    }
    return m
  }, [scopedTrades])

  const equityTradesForChart = useMemo(() => {
    const out: PortfolioTrade[] = []
    for (const list of equityTradesBySymbol.values()) out.push(...list)
    return out
  }, [equityTradesBySymbol])

  const returnProgressionInput = useMemo(
    () => ({
      trades: progressionTrades,
      portfolio,
      scenarios,
      historiesBySymbol: historyPoints,
      asOfDate,
      perfCtx,
      currentYear,
    }),
    [
      progressionTrades,
      portfolio,
      scenarios,
      historyPoints,
      asOfDate,
      perfCtx,
      currentYear,
    ],
  )

  const snapshotTwr = useMemo(
    () => computeBookTimeWeightedReturn(returnProgressionInput),
    [returnProgressionInput],
  )

  const snapshotMwr = useMemo(
    () => computeMoneyWeightedReturn(capitalTrades, terminalNav, asOfDate, perfCtx),
    [capitalTrades, terminalNav, asOfDate, perfCtx],
  )

  const optionTradesForChart = useMemo(
    () => optionTradesForReturnMarkers(portfolioTrades, scopeSymbol),
    [portfolioTrades, scopeSymbol],
  )

  const optionsAggregate = useMemo(
    () =>
      computeOptionsPerformanceAggregate(
        portfolioTrades,
        portfolio,
        scenarios,
        historyPoints,
        todayIsoDate(),
        perfCtx,
      ),
    [portfolioTrades, portfolio, scenarios, historyPoints, perfCtx],
  )

  const breakdownContext = useMemo(
    () => ({
      trades: capitalTrades,
      portfolio,
      scenarios,
      histories: historyPoints,
      asOfDate,
      perfCtx,
      currentYear,
      contributions,
      summary,
      capitalStats,
      peakPortfolio,
      optionsAggregate: optionsAggregate ?? null,
      scopeSymbol,
      snapshotReturnPct,
      snapshotTwr,
      snapshotMwr,
      equityTradesBySymbol,
    }),
    [
      capitalTrades,
      portfolio,
      scenarios,
      historyPoints,
      asOfDate,
      perfCtx,
      currentYear,
      contributions,
      summary,
      capitalStats,
      peakPortfolio,
      optionsAggregate,
      scopeSymbol,
      snapshotReturnPct,
      snapshotTwr,
      snapshotMwr,
      equityTradesBySymbol,
    ],
  )

  const metricBreakdown = useMemo(() => {
    if (!metricDetailId) return null
    return buildPerformanceMetricBreakdown(metricDetailId, breakdownContext)
  }, [metricDetailId, breakdownContext])

  const perfFxWarningActive = hasPerformanceFxWarnings(tradeFxWarnings)

  const openMetric = useCallback((id: PerformanceMetricId) => {
    setMetricDetailId(id)
  }, [])

  const totalOpenMarketValue = useMemo(() => {
    let sum = 0
    let any = false
    for (const s of summary.symbols) {
      if (s.marketValue != null && s.marketValue > 0) {
        sum += s.marketValue
        any = true
      }
    }
    return any ? sum : null
  }, [summary.symbols])

  const symbolsForHistory = useMemo(
    () => equityHistorySymbolsFromTrades(progressionTrades, scopeSymbol),
    [progressionTrades, scopeSymbol],
  )

  useEffect(() => {
    if (symbolsForHistory.length === 0) return
    let cancelled = false
    const stale: string[] = []
    const next: Record<string, CachedPriceHistory> = {}
    for (const symbol of symbolsForHistory) {
      const cached = loadCachedPriceHistory(symbol)
      if (cached) next[symbol] = cached
      if (!cached || !isHistoryFresh(cached.fetchedAt)) stale.push(symbol)
    }
    setHistories((prev) => ({ ...prev, ...next }))
    if (stale.length === 0) return

    setHistLoading((prev) => {
      const s = new Set(prev)
      for (const symbol of stale) s.add(symbol)
      return s
    })

    void Promise.all(
      stale.map(async (symbol) => {
        try {
          const result = await fetchPriceHistoryClient(symbol)
          if (cancelled) return
          const cached: CachedPriceHistory = {
            ...result,
            fetchedAt: new Date().toISOString(),
          }
          saveCachedPriceHistory(cached)
          setHistories((prev) => ({ ...prev, [symbol]: cached }))
        } catch {
          /* keep stale/missing → TWR unavailable */
        } finally {
          if (!cancelled) {
            setHistLoading((prev) => {
              const s = new Set(prev)
              s.delete(symbol)
              return s
            })
          }
        }
      }),
    )
    return () => {
      cancelled = true
    }
  }, [symbolsForHistory.join(',')])

  const twrBySymbol = useMemo(() => {
    const out = new Map<string, TwrResult>()
    for (const sym of summary.symbols.map((s) => s.symbol)) {
      const trades = tradesBySymbol.get(sym) ?? []
      const hist = histories[sym]
      if (!hist?.points?.length) {
        out.set(sym, { twr: null, status: 'unavailable' })
        continue
      }
      out.set(sym, computeTimeWeightedReturn(trades, hist.points, undefined, perfCtx, sym))
    }
    return out
  }, [summary.symbols, tradesBySymbol, histories, perfCtx])

  const activityStats = useMemo((): TradeActivityStats | PortfolioActivityRollup => {
    if (scopeSymbol && summary.symbols.length === 1) {
      const sym = summary.symbols[0]
      const trades = tradesBySymbol.get(sym!.symbol) ?? scopedTrades
      return computeTradeActivity(trades, sym?.ledgerShares ?? 0)
    }
    return computePortfolioActivityRollup(
      summary.symbols.map((s) => ({
        trades: tradesBySymbol.get(s.symbol) ?? [],
        ledgerShares: s.ledgerShares,
      })),
    )
  }, [scopeSymbol, summary.symbols, tradesBySymbol, scopedTrades])

  const holdingStats = useMemo(() => {
    if (!scopeSymbol || summary.symbols.length !== 1 || !summary.symbols[0]) return null
    const s = summary.symbols[0]
    const trades = tradesInDisplayCurrency(
      tradesBySymbol.get(s.symbol) ?? [],
      displayCurrency,
      usdToChf ?? null,
    )
    return computeHoldingCostStats(
      trades,
      s.ledgerShares,
      s.costBasis,
      s.grossBuys,
      s.marketValue,
      totalOpenMarketValue,
    )
  }, [
    scopeSymbol,
    summary.symbols,
    tradesBySymbol,
    totalOpenMarketValue,
    displayCurrency,
    usdToChf,
  ])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [draft, setDraft] = useState<PortfolioTrade | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PortfolioTrade | null>(null)
  const [pendingClear, setPendingClear] = useState(false)
  const [tradeLogOpen, setTradeLogOpen] = useState(false)
  const [closedSymbolsOpen, setClosedSymbolsOpen] = useState(false)
  const [optionsPnlOpen, setOptionsPnlOpen] = useState(true)
  const [optionsByUnderlyingOpen, setOptionsByUnderlyingOpen] = useState(true)
  const [returnChartMode, setReturnChartMode] = useState<ReturnChartMode>('twr')

  const holdingsById = useMemo(() => {
    const m = new Map<string, (typeof portfolio.holdings)[number]>()
    for (const h of portfolio.holdings) m.set(h.id, h)
    return m
  }, [portfolio.holdings])

  const tradeLogHasPositionLink = useMemo(
    () => scopedTrades.some((t) => t.holdingId),
    [scopedTrades],
  )

  const symbolsByLedgerOpen = useMemo(
    () => partitionPerformanceSymbolsByOpen(summary.symbols),
    [summary.symbols],
  )

  const renderSymbolPerformanceRow = (s: SymbolPerformance) => {
    const symTrades = tradesBySymbol.get(s.symbol) ?? []
    const holding = computeHoldingCostStats(
      tradesInDisplayCurrency(symTrades, displayCurrency, usdToChf ?? null),
      s.ledgerShares,
      s.costBasis,
      s.grossBuys,
      s.marketValue,
      totalOpenMarketValue,
    )
    const twr = twrBySymbol.get(s.symbol)
    const loading = histLoading.has(s.symbol)
    return (
      <tr key={s.symbol} className="border-t border-white/5">
        <td className="px-2 py-2 font-medium text-white">{s.symbol}</td>
        <td className="px-2 py-2 text-xs text-white/55">
          {s.ledgerShares > 0 ? 'Open' : 'Closed'}
        </td>
        <td className="px-2 py-2 text-right text-xs tabular-nums text-white/80">
          {loading ? '…' : twrLabel(twr)}
        </td>
        <td
          className={`px-2 py-2 text-right tabular-nums text-xs ${pnlClass(s.realizedPnl)}`}
        >
          {fmt(s.realizedPnl)}
        </td>
        <td className="px-2 py-2 text-right text-xs tabular-nums text-white/80">
          {pct(s.returnPct)}
        </td>
        <td className="px-2 py-2 text-right text-xs tabular-nums text-white/55">
          {holding.concentration != null ? pct(holding.concentration) : '—'}
        </td>
      </tr>
    )
  }

  const symbolTableHeader = (
    <thead className="text-xs uppercase tracking-wider text-white/45">
      <tr>
        <th className="px-2 py-2 text-left font-medium">Symbol</th>
        <th className="px-2 py-2 text-left font-medium">Status</th>
        <th className="px-2 py-2 text-right font-medium">TWR</th>
        <th className="px-2 py-2 text-right font-medium">Realized</th>
        <th className="px-2 py-2 text-right font-medium">Return</th>
        <th className="px-2 py-2 text-right font-medium">Conc.</th>
      </tr>
    </thead>
  )

  const snapshotMarkNote = useMemo(
    () => formatSnapshotMarkSummary(summary.symbols),
    [summary.symbols],
  )

  const returnProgression = useMemo(
    () => buildFullReturnProgression(returnProgressionInput),
    [returnProgressionInput],
  )

  const returnChartOptionMarkers = useMemo(
    () =>
      buildReturnChartOptionMarkers(
        optionTradesForChart,
        returnProgression.points,
        returnChartMode,
        displayCurrency,
        usdToChf ?? null,
      ),
    [
      optionTradesForChart,
      returnProgression.points,
      returnChartMode,
      displayCurrency,
      usdToChf,
    ],
  )

  const returnHistoryNote = useMemo(() => {
    const missing = returnProgression.missingHistorySymbols
    const stale = returnProgression.staleHistorySymbols ?? []
    if (missing.length === 0 && stale.length === 0) return null
    const parts: string[] = []
    if (missing.length > 0) {
      parts.push(`Missing price history: ${missing.join(', ')}`)
    }
    if (stale.length > 0) {
      parts.push(`Carried closes >7d old on past dates: ${stale.join(', ')}`)
    }
    return parts.join(' · ')
  }, [returnProgression.missingHistorySymbols, returnProgression.staleHistorySymbols])

  const handleSaveTrade = (trade: PortfolioTrade) => {
    const ok = onSaveTrade(trade)
    if (ok) setTradeLogOpen(true)
    return ok
  }

  const openNew = (symbol?: string, holdingId?: string) => {
    setDraft(
      newPortfolioTrade(portfolio.id, {
        symbol: symbol ?? '',
        holdingId,
      }),
    )
    setDrawerOpen(true)
  }

  useEffect(() => {
    if (!logTradeSeed?.symbol) return
    setDraft(
      newPortfolioTrade(portfolio.id, {
        symbol: logTradeSeed.symbol,
        holdingId: logTradeSeed.holdingId,
      }),
    )
    setDrawerOpen(true)
    onClearLogTradeSeed?.()
  }, [logTradeSeed, onClearLogTradeSeed, portfolio.id])

  const openEdit = (trade: PortfolioTrade) => {
    setDraft({ ...trade })
    setDrawerOpen(true)
  }

  const activityRows = useMemo(() => {
    const rows: {
      label: string
      value: string
      onClick?: () => void
      fxApprox?: boolean
    }[] = [
      { label: 'Trades', value: String(activityStats.tradeCount) },
      { label: 'Buys', value: String(activityStats.buyCount) },
      { label: 'Sells', value: String(activityStats.sellCount) },
      {
        label: 'First trade',
        value: activityStats.firstTradeDate ?? '—',
      },
      {
        label: 'Last trade',
        value: activityStats.lastTradeDate ?? '—',
      },
    ]
    if (scopeSymbol) {
      rows.push({
        label: 'Holding period',
        value: formatHoldingPeriod(activityStats.holdingPeriodDays),
      })
      rows.push({
        label: 'Status',
        value: activityStats.status === 'open' ? 'Open' : 'Closed',
      })
    } else if ('openSymbolCount' in activityStats) {
      rows.push({
        label: 'Symbols',
        value: `${activityStats.openSymbolCount} open · ${activityStats.closedSymbolCount} closed`,
      })
    }
    rows.push({
      label: `Peak net invested capital (${displayCurrency})`,
      value: fmt(capitalStats.peakNet),
      onClick: () => openMetric('peakNetInvested'),
      fxApprox: perfFxWarningActive && metricUsesTradeDateFx('peakNetInvested'),
    })
    rows.push({
      label: 'Peak portfolio value',
      value: fmt(peakPortfolio.peakValue),
      fxApprox: perfFxWarningActive && metricUsesTradeDateFx('peakPortfolioValue'),
    })
    return rows
  }, [
    activityStats,
    scopeSymbol,
    capitalStats.peakNet,
    peakPortfolio.peakValue,
    fmt,
    displayCurrency,
    openMetric,
    perfFxWarningActive,
  ])

  const holdingRows = useMemo(() => {
    if (!holdingStats) return []
    return [
      { label: 'Ledger shares', value: formatInputShares(holdingStats.ledgerShares) },
      {
        label: 'Avg cost',
        value:
          holdingStats.averageCost != null
            ? formatPrice(holdingStats.averageCost, displayCurrency)
            : '—',
      },
      {
        label: 'Breakeven',
        value:
          holdingStats.breakeven != null
            ? formatPrice(holdingStats.breakeven, displayCurrency)
            : '—',
      },
      {
        label: 'Gross buys',
        value: fmt(holdingStats.grossBuys),
      },
      {
        label: 'Sell proceeds',
        value: fmt(holdingStats.sellProceeds),
      },
      {
        label: '% sold',
        value: pct(holdingStats.pctSold),
      },
      {
        label: 'Open basis',
        value: fmt(holdingStats.openCostBasis),
      },
      {
        label: 'Current value',
        value:
          holdingStats.currentValue != null
            ? fmt(holdingStats.currentValue)
            : 'No mark',
      },
      {
        label: 'TWR',
        value:
          scopeSymbol && summary.symbols[0]
            ? twrLabel(twrBySymbol.get(summary.symbols[0]!.symbol))
            : '—',
      },
    ]
  }, [holdingStats, scopeSymbol, twrBySymbol, fmt, displayCurrency])

  return (
    <div className="space-y-5" data-guide-anchor="portfolio.performance">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-white">Performance</h3>
              <FeatureGuideButton id="portfolio.performance" />
            </div>
            {tradedEquitySymbols.length > 0 ? (
              <select
                className="input !w-auto max-w-[11rem] !py-1 !text-xs tabular-nums"
                value={scopeSymbol ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setScopeSymbol(v ? v : null)
                }}
                aria-label="Performance scope"
              >
                <option value="">Whole portfolio</option>
                {tradedEquitySymbols.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1 !text-xs"
              onClick={() =>
                downloadPortfolioTradesExport(
                  tradesState,
                  portfolio.id,
                  portfolio.name.replace(/\s+/g, '-'),
                )
              }
              disabled={portfolioTrades.length === 0}
            >
              Export
            </button>
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1 !text-xs"
              onClick={() => setPendingClear(true)}
              disabled={portfolioTrades.length === 0}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn-ghost !px-2.5 !py-1 !text-xs"
              onClick={() => setImportOpen(true)}
            >
              Import
            </button>
            <button
              type="button"
              className="btn-primary !px-2.5 !py-1 !text-xs"
              onClick={() => openNew(scopeSymbol ?? undefined)}
            >
              + Trade
            </button>
          </div>
          <p className="mt-1 text-xs text-white/45">
            {scopeSymbol
              ? `Stock ledger and P&L for ${scopeSymbol} on this book (options are in Options P/L below).`
              : 'All traded symbols on this book (incl. closed). Ledger does not change Positions.'}
          </p>
        </div>
      </div>

      {tradesError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {tradesError}
        </p>
      ) : null}

      {perfFxWarningActive ? (
        <PerformanceFxWarningsBanner warnings={tradeFxWarnings} />
      ) : null}

      {scopedTrades.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
            Activity
          </h4>
          <CompactStats rows={activityRows} />
        </section>
      ) : null}

      {returnProgression.points.length > 0 ? (
        <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
          <PortfolioReturnChart
            points={returnProgression.points}
            trades={equityTradesForChart}
            optionMarkers={returnChartOptionMarkers}
            mode={returnChartMode}
            missingNote={returnHistoryNote}
            displayCurrency={displayCurrency}
            usdToChf={usdToChf}
            onModeChange={setReturnChartMode}
          />
        </section>
      ) : null}

      {optionsAggregate ? (
        <section
          className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] px-3 py-2.5"
          data-guide-anchor="portfolio.performance.optionsPnl"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 text-left text-[10px] font-semibold uppercase tracking-wide text-amber-200/85 hover:text-amber-100"
            aria-expanded={optionsPnlOpen}
            onClick={() => setOptionsPnlOpen((o) => !o)}
          >
            <span
              className={`text-[10px] text-amber-200/50 transition-transform ${optionsPnlOpen ? 'rotate-90' : ''}`}
              aria-hidden
            >
              ▸
            </span>
            Options P/L (whole book)
          </button>
          {optionsPnlOpen ? (
          <>
          <div className="grid gap-2 sm:grid-cols-3">
            <StatsCardButton
              className="rounded-lg border border-amber-500/20 bg-black/20 px-2.5 py-2 text-left"
              onClick={() => openMetric('optionsRealized')}
            >
              <p className="text-[10px] uppercase text-white/45">Realized</p>
              <p className="tabular-nums text-white">{fmt(optionsAggregate.realizedPnl)}</p>
            </StatsCardButton>
            <StatsCardButton
              className="rounded-lg border border-amber-500/20 bg-black/20 px-2.5 py-2 text-left"
              onClick={() => openMetric('optionsUnrealized')}
            >
              <p className="text-[10px] uppercase text-white/45">Unrealized</p>
              <p className="tabular-nums text-white">{fmt(optionsAggregate.unrealizedPnl)}</p>
            </StatsCardButton>
            <StatsCardButton
              className="rounded-lg border border-amber-500/20 bg-black/20 px-2.5 py-2 text-left"
              onClick={() => openMetric('optionsTotal')}
            >
              <p className="text-[10px] uppercase text-white/45">Total</p>
              <p className="tabular-nums text-white">{fmt(optionsAggregate.totalPnl)}</p>
            </StatsCardButton>
          </div>
          <CompactStats
            rows={[
              { label: 'Premium received', value: fmt(optionsAggregate.premiumReceived) },
              { label: 'Premium paid', value: fmt(optionsAggregate.premiumPaid) },
              { label: 'Open contracts', value: String(optionsAggregate.openContracts) },
              { label: 'Closed series', value: String(optionsAggregate.closedSeries) },
              {
                label: 'Win rate',
                value: pct(optionsAggregate.winRate),
              },
            ]}
          />
          {optionsAggregate.byUnderlying.length > 0 ? (
            <div className="space-y-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left text-[10px] font-semibold uppercase tracking-wide text-amber-200/70 hover:text-amber-100/90"
                aria-expanded={optionsByUnderlyingOpen}
                onClick={() => setOptionsByUnderlyingOpen((o) => !o)}
              >
                <span
                  className={`text-[10px] text-amber-200/45 transition-transform ${optionsByUnderlyingOpen ? 'rotate-90' : ''}`}
                  aria-hidden
                >
                  ▸
                </span>
                By underlying ({optionsAggregate.byUnderlying.length})
              </button>
              {optionsByUnderlyingOpen ? (
                <div className="table-shell overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="uppercase tracking-wider text-white/40">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-medium">Underlying</th>
                        <th className="px-2 py-1.5 text-right font-medium">Total</th>
                        <th className="px-2 py-1.5 text-right font-medium">Realized</th>
                        <th className="px-2 py-1.5 text-right font-medium">Received</th>
                        <th className="px-2 py-1.5 text-right font-medium">Paid</th>
                        <th className="px-2 py-1.5 text-right font-medium">Open</th>
                        <th className="px-2 py-1.5 text-right font-medium">Wins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optionsAggregate.byUnderlying.map((row) => (
                        <tr key={row.underlying} className="border-t border-white/5">
                          <td className="px-2 py-1.5 font-medium text-white">{row.underlying}</td>
                          <td
                            className={`px-2 py-1.5 text-right tabular-nums ${pnlClass(row.totalPnl)}`}
                          >
                            {fmt(row.totalPnl)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-white/80">
                            {fmt(row.realizedPnl)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-white/70">
                            {fmt(row.premiumReceived)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-white/70">
                            {fmt(row.premiumPaid)}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-white/70">
                            {row.openContracts}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-white/70">
                            {row.closedSeries > 0
                              ? `${row.winCount}/${row.closedSeries}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[11px] text-white/35">
                  Collapsed — per-underlying rows hidden; book totals above unchanged.
                </p>
              )}
            </div>
          ) : null}
          </>
          ) : (
            <p className="text-[11px] text-white/35">
              Collapsed — book-wide option totals hidden until you expand.
            </p>
          )}
        </section>
      ) : null}

      {scopeSymbol && holdingRows.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-sky-300/80">
            Position
          </h4>
          <CompactStats rows={holdingRows} />
        </section>
      ) : null}

      {scopedTrades.length > 0 ? (
        <SnapshotReturnStatsCard
          totalPnl={summary.totalPnl}
          snapshotReturnPct={snapshotReturnPct}
          currentNet={capitalStats.currentNet}
          grossBuys={capitalStats.grossBuys}
          snapshotTwr={snapshotTwr}
          snapshotMwr={snapshotMwr}
          snapshotMarkNote={snapshotMarkNote}
          perfFxWarningActive={perfFxWarningActive}
          fmt={fmt}
          onOpenMetric={openMetric}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { id: 'realized' as const, label: 'Realized P&L', value: summary.realizedPnl },
            {
              id: 'unrealized' as const,
              label: 'Unrealized P&L',
              value: summary.unrealizedPnl,
            },
            { id: 'totalPnl' as const, label: 'Total P&L', value: summary.totalPnl },
            {
              id: 'netCapital' as const,
              label: 'Net capital (current)',
              value: capitalStats.currentNet,
              isMoney: true,
              sub: `Gross buys ${fmt(capitalStats.grossBuys)}`,
            },
          ] as Array<{
            id: PerformanceMetricId
            label: string
            value: number
            isMoney?: boolean
            sub?: string
          }>
        ).map((card) => (
          <StatsCardButton
            key={card.label}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left"
            onClick={() => openMetric(card.id)}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {card.label}
              {perfFxWarningActive && metricUsesTradeDateFx(card.id) ? (
                <PerformanceFxMetricBadge />
              ) : null}
            </p>
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${
                card.isMoney ? 'text-white' : pnlClass(card.value)
              }`}
            >
              {fmt(card.value)}
            </p>
            {card.sub ? (
              <p className="mt-0.5 text-[10px] text-white/40">{card.sub}</p>
            ) : null}
          </StatsCardButton>
        ))}
      </div>

      {summary.symbols.length > 0 && !scopeSymbol ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-300/80">
            By symbol
          </h4>
          {symbolsByLedgerOpen.open.length > 0 ? (
            <div className="table-shell overflow-x-auto">
              <table className="min-w-full text-sm">
                {symbolTableHeader}
                <tbody>
                  {symbolsByLedgerOpen.open.map((s) => renderSymbolPerformanceRow(s))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-white/40">No open ledger positions.</p>
          )}
          {symbolsByLedgerOpen.closed.length > 0 ? (
            <div className="space-y-1">
              <button
                type="button"
                className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-white/50 hover:text-white/75"
                aria-expanded={closedSymbolsOpen}
                onClick={() => setClosedSymbolsOpen((o) => !o)}
              >
                <span
                  className={`text-[10px] text-white/40 transition-transform ${closedSymbolsOpen ? 'rotate-90' : ''}`}
                  aria-hidden
                >
                  ▸
                </span>
                Closed positions ({symbolsByLedgerOpen.closed.length})
              </button>
              {closedSymbolsOpen ? (
                <div className="table-shell overflow-x-auto">
                  <table className="min-w-full text-sm">
                    {symbolTableHeader}
                    <tbody>
                      {symbolsByLedgerOpen.closed.map((s) =>
                        renderSymbolPerformanceRow(s),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[11px] text-white/35">
                  Collapsed — realized P&L still counts in totals above.
                </p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="space-y-2">
        <button
          type="button"
          className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-sky-300/80 hover:text-sky-200"
          aria-expanded={tradeLogOpen}
          onClick={() => setTradeLogOpen((o) => !o)}
        >
          <span
            className={`text-[10px] text-white/40 transition-transform ${tradeLogOpen ? 'rotate-90' : ''}`}
            aria-hidden
          >
            ▸
          </span>
          Trade log
          {scopedTrades.length > 0 ? (
            <span className="font-normal normal-case tracking-normal text-white/40">
              ({scopedTrades.length})
            </span>
          ) : null}
        </button>
        {scopedTrades.length === 0 ? (
          <p className="text-sm text-white/40">
            No trades yet. Use **+ Trade** or paste trades into your save file under{' '}
            <code className="text-emerald-300/80">portfolioTrades</code>.
          </p>
        ) : tradeLogOpen ? (
          <div className="table-shell overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-white/45">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  {!scopeSymbol ? (
                    <th className="px-3 py-2 text-left font-medium">Symbol</th>
                  ) : null}
                  <th className="px-3 py-2 text-left font-medium">Side</th>
                  <th className="px-3 py-2 text-right font-medium">Shares</th>
                  <th className="px-3 py-2 text-left font-medium">Ccy</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Fees</th>
                  {tradeLogHasPositionLink ? (
                    <th className="px-3 py-2 text-left font-medium">Position</th>
                  ) : null}
                  <th className="px-3 py-2 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {[...scopedTrades]
                  .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
                  .map((t) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="px-3 py-2 tabular-nums text-white/80">{t.tradeDate}</td>
                      {!scopeSymbol ? (
                        <td className="px-3 py-2 font-medium text-white">
                          {t.instrument === 'option'
                            ? (() => {
                                const c = parseOccSymbol(t.symbol)
                                return c ? optionLabel(c) : t.symbol
                              })()
                            : t.symbol}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 capitalize">
                        <span
                          className={
                            t.event && t.event !== 'trade'
                              ? 'text-amber-300/85'
                              : t.side === 'buy'
                                ? 'text-emerald-300/85'
                                : 'text-red-300/85'
                          }
                        >
                          {t.event && t.event !== 'trade' ? t.event : t.side}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/80">
                        {formatInputShares(t.shares)}
                      </td>
                      <td className="px-3 py-2 text-xs text-white/55">
                        {t.currency ?? 'USD'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/80">
                        {fmtStoredPrice(t.price, t.currency)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/50">
                        {(t.fees ?? 0) > 0
                          ? fmtStoredMoney(t.fees!, t.feesCurrency ?? t.currency)
                          : '—'}
                      </td>
                      {tradeLogHasPositionLink ? (
                        <td className="px-3 py-2 text-xs text-white/55">
                          {t.holdingId && onFocusHolding ? (
                            <button
                              type="button"
                              className="text-sky-300/85 hover:text-sky-200"
                              onClick={() => onFocusHolding(t.holdingId!)}
                            >
                              {holdingsById.get(t.holdingId)?.symbol ?? t.symbol}
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      ) : null}
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="mr-2 text-[11px] text-sky-300/80 hover:text-sky-200"
                          onClick={() => openEdit(t)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-red-300/70 hover:text-red-200"
                          onClick={() => setPendingDelete(t)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[11px] text-white/35">Collapsed — expand to edit or delete trades.</p>
        )}
      </section>

      <PortfolioTradeDrawer
        open={drawerOpen}
        draft={draft}
        portfolio={portfolio}
        scenarios={scenarios}
        bookTrades={portfolioTrades}
        historyBySymbol={historyPoints}
        quoteCurrencyBySymbol={quoteCurrencyBySymbol}
        onClose={() => {
          setDrawerOpen(false)
          setDraft(null)
        }}
        onSave={handleSaveTrade}
      />

      <PortfolioTradeImportModal
        open={importOpen}
        portfolio={portfolio}
        scenarios={scenarios}
        tradesState={tradesState}
        onClose={() => setImportOpen(false)}
        onApply={(next) => {
          const ok = onReplaceTrades(next)
          if (ok) setTradeLogOpen(true)
          return ok
        }}
      />

      {pendingClear ? (
        <ConfirmDialog
          title="Clear all trades on this book?"
          confirmLabel="Clear trades"
          onClose={() => setPendingClear(false)}
          onConfirm={() => {
            const next = clearTradesForPortfolio(tradesState, portfolio.id)
            onReplaceTrades(next)
            setPendingClear(false)
            setTradeLogOpen(false)
          }}
        >
          <p>
            Remove all {portfolioTrades.length} trade
            {portfolioTrades.length === 1 ? '' : 's'} from{' '}
            <span className="text-white/85">{portfolio.name}</span>. Export first if you
            want a backup. Positions are unchanged.
          </p>
        </ConfirmDialog>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          title="Delete trade?"
          confirmLabel="Delete"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            onDeleteTrade(pendingDelete.id)
            setPendingDelete(null)
          }}
        >
          <p>
            Remove {pendingDelete.side} {formatInputShares(pendingDelete.shares)}{' '}
            {pendingDelete.symbol} on {pendingDelete.tradeDate}?
          </p>
        </ConfirmDialog>
      ) : null}

      <PerformanceMetricDrawer
        open={metricDetailId != null}
        breakdown={metricBreakdown}
        displayCurrency={displayCurrency}
        onClose={() => setMetricDetailId(null)}
      />
    </div>
  )
}

function formatInputShares(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(4).replace(/\.?0+$/, '')
}