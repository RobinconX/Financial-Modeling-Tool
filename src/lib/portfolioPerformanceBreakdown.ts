import type {
  DisplayCurrency,
  PortfolioContributionsState,
  PortfolioTrade,
  SavedPortfolio,
  SavedScenario,
} from '../types'
import type { PriceHistoryPoint } from './priceHistory'
import { toDisplay } from './fx'
import { investedForRoiDisplay } from './portfolioContributions'
import {
  CASH_TAB_SOURCE_LABEL,
  CASH_TAB_YEAR_RESOLUTION_NOTE,
  cashTabBalanceDisplayAsOf,
} from './portfolioCashTab'
import type { OptionsPerformanceAggregate } from './portfolioOptionsPerformance'
import {
  buildPeakNetInvestedTimeline,
  computeCapitalContributionStats,
  computePeakPortfolioValue,
  computePortfolioTerminalNav,
  tradeSellProceeds,
  type MwrResult,
} from './portfolioReturnMetrics'
import { holdingLiveValue } from './portfolio'
import {
  ledgerSnapshotAt,
  tradeInstrument,
  withAutoExpireTrades,
} from './portfolioTradeLedger'
import type { PerfDisplayContext } from './portfolioTradeFx'
import type { PortfolioPerformanceSummary, SymbolPerformance } from './portfolioTrades'
import type { TwrResult } from './portfolioPerformanceStats'

export type PerformanceMetricId =
  | 'realized'
  | 'unrealized'
  | 'totalPnl'
  | 'netCapital'
  | 'peakNetInvested'
  | 'peakPortfolioValue'
  | 'snapshotReturn'
  | 'grossBuys'
  | 'twr'
  | 'mwr'
  | 'optionsRealized'
  | 'optionsUnrealized'
  | 'optionsTotal'

export type BreakdownRowKind = 'equity' | 'option'

export type PerformanceBreakdownRow = {
  key: string
  kind: BreakdownRowKind
  symbol: string
  shares: number | null
  costBasis: number | null
  markPrice: number | null
  markSource: string | null
  fxNote: string | null
  marketValue: number | null
  contribution: number
}

export type ReconciliationLine = {
  label: string
  amount: number
}

export type PeakNetTimelineRow = {
  date: string
  events: string
  flow: number
  runningTotal: number
  isPeak: boolean
}

export type PeakNetCapitalReconciliation = {
  grossBuys: number
  sellProceeds: number
  openCostBasis: number
  realizedPnl: number
  netCapitalFromFlows: number
  netCapitalFromLedger: number
}

export type PerformanceMetricBreakdown = {
  metricId: PerformanceMetricId
  title: string
  formula: string
  inputs: { label: string; value: string }[]
  rows: PerformanceBreakdownRow[]
  total: number
  warnings: string[]
  timelineRows?: PeakNetTimelineRow[]
  peakNetReconciliation?: PeakNetCapitalReconciliation
  reconciliation?: {
    chartImpliedPnl: number
    performancePnl: number
    gap: number
    lines: ReconciliationLine[]
    cashSourceLabel: string
    cashResolutionNote: string
  }
  twrMeta?: { missingSymbols: string[]; twr: TwrResult }
  mwrMeta?: { terminalNav: number; cashSourceLabel: string; mwr: MwrResult }
}

export type PerformanceBreakdownContext = {
  trades: PortfolioTrade[]
  portfolio: SavedPortfolio
  scenarios: SavedScenario[]
  histories: Record<string, PriceHistoryPoint[]>
  asOfDate: string
  perfCtx: PerfDisplayContext
  currentYear: number
  contributions: PortfolioContributionsState | null
  summary: PortfolioPerformanceSummary
  capitalStats: ReturnType<typeof computeCapitalContributionStats>
  peakPortfolio: ReturnType<typeof computePeakPortfolioValue>
  optionsAggregate: OptionsPerformanceAggregate | null
  scopeSymbol: string | null
  snapshotReturnPct: number | null
  snapshotTwr: TwrResult
  snapshotMwr: MwrResult
  equityTradesBySymbol: Map<string, PortfolioTrade[]>
}

function rowFromSymbol(
  s: SymbolPerformance,
  contribution: number,
  perfCtx: PerfDisplayContext,
): PerformanceBreakdownRow {
  const kind: BreakdownRowKind = s.instrument === 'option' ? 'option' : 'equity'
  const fxNote =
    s.markPrice != null
      ? `Display ${perfCtx.displayCurrency}` +
        (s.markSource ? ` · ${s.markSource}` : '')
      : null
  return {
    key: s.symbol,
    kind,
    symbol: s.symbol,
    shares: s.ledgerShares,
    costBasis: s.costBasis,
    markPrice: s.markPrice,
    markSource: s.markSource,
    fxNote,
    marketValue: s.marketValue,
    contribution,
  }
}

function equitySymbolsHeldMismatch(
  portfolio: SavedPortfolio,
  trades: PortfolioTrade[],
  asOfDate: string,
  perfCtx?: PerfDisplayContext,
): string[] {
  const expanded = withAutoExpireTrades(trades, asOfDate)
  const bySym = new Map<string, PortfolioTrade[]>()
  for (const t of expanded) {
    if (tradeInstrument(t) === 'option') continue
    const list = bySym.get(t.symbol) ?? []
    list.push(t)
    bySym.set(t.symbol, list)
  }
  const warnings: string[] = []
  for (const [sym, list] of bySym) {
    const snap = ledgerSnapshotAt(list, asOfDate, perfCtx)
    const holdings = portfolio.holdings.filter(
      (h) => !h.option && (h.symbol ?? '').toUpperCase() === sym,
    )
    if (holdings.length === 0 && snap.shares !== 0) {
      warnings.push(`${sym}: ledger ${snap.shares} sh but no Position row`)
      continue
    }
    for (const h of holdings) {
      const held = h.sharesHeld
      if (Math.abs(held - snap.shares) > 1e-4) {
        warnings.push(
          `${sym}: ledger ${snap.shares.toFixed(4)} sh vs Position ${held.toFixed(4)} sh`,
        )
      }
    }
  }
  return warnings
}

function chartNowComponents(
  portfolio: SavedPortfolio,
  scenarios: SavedScenario[],
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
  asOfDate: string,
  currentYear: number,
): { cash: number; equityValue: number; total: number } {
  const cash = cashTabBalanceDisplayAsOf(
    portfolio,
    scenarios,
    asOfDate,
    displayCurrency,
    usdToChf,
    currentYear,
  ).amount
  const byId = new Map(scenarios.map((s) => [s.id, s]))
  let equityUsd = 0
  for (const h of portfolio.holdings) {
    if (h.option) continue
    const scenario =
      h.scenarioId && !h.manualOnly ? (byId.get(h.scenarioId) ?? null) : null
    equityUsd += holdingLiveValue(h, scenario, [], currentYear) ?? 0
  }
  const equityValue = toDisplay(equityUsd, displayCurrency, usdToChf)
  return { cash, equityValue, total: cash + equityValue }
}

function buildReconciliation(
  ctx: PerformanceBreakdownContext,
): PerformanceMetricBreakdown['reconciliation'] {
  const { portfolio, scenarios, contributions, summary, perfCtx, asOfDate, currentYear } =
    ctx
  if (!contributions) return undefined
  const chart = chartNowComponents(
    portfolio,
    scenarios,
    perfCtx.displayCurrency,
    perfCtx.usdToChf,
    asOfDate,
    currentYear,
  )
  const moneyIn =
    investedForRoiDisplay(
      contributions,
      currentYear,
      perfCtx.displayCurrency,
      perfCtx.usdToChf,
      portfolio,
      currentYear,
      true,
    ) ?? 0
  const chartImpliedPnl = chart.total - moneyIn
  const performancePnl = summary.totalPnl
  let optionsInPerf = 0
  for (const s of summary.symbols) {
    if (s.instrument === 'option') {
      optionsInPerf += s.totalPnl ?? 0
    }
  }
  let optionsNotInChart = 0
  for (const s of summary.symbols) {
    if (s.instrument === 'option') {
      optionsNotInChart += s.marketValue ?? 0
    }
  }
  const gap = chartImpliedPnl - performancePnl
  const lines: ReconciliationLine[] = [
    { label: 'Chart positions (Cash tab + Positions marks)', amount: chart.total },
    { label: 'Money-in (Actuals)', amount: moneyIn },
    { label: 'Chart implied P/L (value − Money-in)', amount: chartImpliedPnl },
    { label: 'Performance total P/L (trade ledger)', amount: performancePnl },
    { label: 'Options P/L in Performance (not on Chart stack)', amount: optionsInPerf },
    { label: 'Option marks on ledger (MTM)', amount: optionsNotInChart },
  ]
  const residual = gap - optionsInPerf
  if (Math.abs(residual) > 0.5) {
    lines.push({
      label: 'Residual (Positions vs ledger, FX spot, fees, …)',
      amount: residual,
    })
  }
  const cashMeta = cashTabBalanceDisplayAsOf(
    portfolio,
    scenarios,
    asOfDate,
    perfCtx.displayCurrency,
    perfCtx.usdToChf,
    currentYear,
  )
  return {
    chartImpliedPnl,
    performancePnl,
    gap,
    lines,
    cashSourceLabel: cashMeta.sourceLabel,
    cashResolutionNote: cashMeta.resolutionNote,
  }
}

function appendFxWarnings(warnings: string[], perfCtx: PerfDisplayContext): string[] {
  const extra = perfCtx.fxWarnings ?? []
  if (extra.length === 0) return warnings
  return [...warnings, ...extra]
}

function peakNetCapitalReconciliation(
  ctx: PerformanceBreakdownContext,
): PeakNetCapitalReconciliation {
  const { capitalStats, summary, perfCtx } = ctx
  let sellProceeds = 0
  const expanded = withAutoExpireTrades(ctx.trades, ctx.asOfDate)
  for (const t of expanded) {
    if (t.tradeDate > ctx.asOfDate) continue
    sellProceeds += tradeSellProceeds(t, perfCtx)
  }
  const openCostBasis = summary.symbols.reduce(
    (acc, s) => (s.ledgerShares !== 0 ? acc + s.costBasis : acc),
    0,
  )
  const netCapitalFromFlows = capitalStats.grossBuys - sellProceeds
  const netCapitalFromLedger = openCostBasis - summary.realizedPnl
  return {
    grossBuys: capitalStats.grossBuys,
    sellProceeds,
    openCostBasis,
    realizedPnl: summary.realizedPnl,
    netCapitalFromFlows,
    netCapitalFromLedger,
  }
}

export function buildPerformanceMetricBreakdown(
  metricId: PerformanceMetricId,
  ctx: PerformanceBreakdownContext,
): PerformanceMetricBreakdown {
  const { summary, capitalStats, peakPortfolio, optionsAggregate, perfCtx } = ctx
  const warnings = appendFxWarnings(
    equitySymbolsHeldMismatch(
      ctx.portfolio,
      ctx.trades,
      ctx.asOfDate,
      perfCtx,
    ),
    perfCtx,
  )

  const baseInputs = [
    { label: 'As-of', value: ctx.asOfDate },
    { label: 'Display', value: perfCtx.displayCurrency },
    {
      label: 'Cash (reconciliation)',
      value: CASH_TAB_SOURCE_LABEL,
    },
  ]

  switch (metricId) {
    case 'realized': {
      const rows = summary.symbols.map((s) =>
        rowFromSymbol(s, s.realizedPnl, perfCtx),
      )
      const total = rows.reduce((a, r) => a + r.contribution, 0)
      return {
        metricId,
        title: 'Realized P&L',
        formula: 'Sum of realized P&L per symbol (average-cost ledger).',
        inputs: baseInputs,
        rows,
        total,
        warnings,
      }
    }
    case 'unrealized': {
      const rows = summary.symbols
        .filter((s) => s.ledgerShares !== 0)
        .map((s) => rowFromSymbol(s, s.unrealizedPnl ?? 0, perfCtx))
      const total = rows.reduce((a, r) => a + r.contribution, 0)
      return {
        metricId,
        title: 'Unrealized P&L',
        formula:
          'Long: mark × shares − basis. Short option: premium credit + mark value (liability).',
        inputs: baseInputs,
        rows,
        total,
        warnings,
      }
    }
    case 'totalPnl': {
      const rows = summary.symbols.map((s) =>
        rowFromSymbol(s, s.totalPnl ?? 0, perfCtx),
      )
      const total = rows.reduce((a, r) => a + r.contribution, 0)
      return {
        metricId,
        title: 'Total P&L',
        formula: 'Realized + unrealized per symbol.',
        inputs: baseInputs,
        rows,
        total,
        warnings,
        reconciliation: buildReconciliation(ctx),
      }
    }
    case 'netCapital': {
      return {
        metricId,
        title: 'Net capital (current)',
        formula: 'Cumulative buys + fees − sell proceeds (trade cash flows).',
        inputs: [
          ...baseInputs,
          { label: 'Net capital', value: String(capitalStats.currentNet) },
          { label: 'Gross buys', value: String(capitalStats.grossBuys) },
        ],
        rows: [],
        total: capitalStats.currentNet,
        warnings,
        reconciliation: buildReconciliation(ctx),
      }
    }
    case 'peakNetInvested': {
      const timelineRows = buildPeakNetInvestedTimeline(
        ctx.trades,
        ctx.asOfDate,
        perfCtx,
      )
      const peakRecon = peakNetCapitalReconciliation(ctx)
      return {
        metricId,
        title: 'Peak net invested capital',
        formula:
          'Maximum running net of buy contributions − sell proceeds through today (one net step per calendar day). Trade cash flows use USD/CHF on each trade date.',
        inputs: [
          ...baseInputs,
          { label: 'Peak', value: String(capitalStats.peakNet) },
          { label: 'Current net', value: String(capitalStats.currentNet) },
        ],
        rows: [],
        total: capitalStats.peakNet,
        warnings,
        timelineRows,
        peakNetReconciliation: peakRecon,
      }
    }
    case 'peakPortfolioValue': {
      return {
        metricId,
        title: 'Peak portfolio value',
        formula: `Cash tab balance + sum of ledger marks at each date. ${CASH_TAB_YEAR_RESOLUTION_NOTE}`,
        inputs: [
          ...baseInputs,
          { label: 'Peak value', value: String(peakPortfolio.peakValue) },
          { label: 'Peak date', value: peakPortfolio.peakDate ?? '—' },
          { label: 'Value today', value: String(peakPortfolio.valueAsOf) },
          { label: 'Cash source', value: CASH_TAB_SOURCE_LABEL },
        ],
        rows: summary.symbols
          .filter((s) => s.ledgerShares !== 0)
          .map((s) => rowFromSymbol(s, s.marketValue ?? 0, perfCtx)),
        total: peakPortfolio.peakValue,
        warnings,
      }
    }
    case 'snapshotReturn': {
      const total = ctx.snapshotReturnPct ?? 0
      return {
        metricId,
        title: 'Snapshot return %',
        formula: 'Total P&L ÷ peak net invested capital.',
        inputs: [
          { label: 'Total P&L', value: String(summary.totalPnl) },
          { label: 'Peak net invested', value: String(capitalStats.peakNet) },
          { label: 'Return %', value: String(total) },
        ],
        rows: [],
        total,
        warnings,
      }
    }
    case 'grossBuys': {
      const rows = summary.symbols.map((s) =>
        rowFromSymbol(s, s.grossBuys, perfCtx),
      )
      const total = capitalStats.grossBuys
      return {
        metricId,
        title: 'Gross buys',
        formula: 'Cumulative buy notional + buy-side fees.',
        inputs: baseInputs,
        rows,
        total,
        warnings,
      }
    }
    case 'twr': {
      const missing: string[] = []
      for (const sym of ctx.equityTradesBySymbol.keys()) {
        if (!(ctx.histories[sym]?.length > 0)) missing.push(sym)
      }
      return {
        metricId,
        title: 'TWR',
        formula: 'Time-weighted return on equity ledger (daily closes).',
        inputs: baseInputs,
        rows: [],
        total: ctx.snapshotTwr.twr ?? 0,
        warnings,
        twrMeta: { missingSymbols: missing, twr: ctx.snapshotTwr },
      }
    }
    case 'mwr': {
      const cashMeta = cashTabBalanceDisplayAsOf(
        ctx.portfolio,
        ctx.scenarios,
        ctx.asOfDate,
        perfCtx.displayCurrency,
        perfCtx.usdToChf,
        ctx.currentYear,
      )
      const terminal = computePortfolioTerminalNav(summary, cashMeta.amount)
      return {
        metricId,
        title: 'MWR (XIRR)',
        formula:
          'IRR on trade investor cash flows with terminal NAV (Cash tab + all marks).',
        inputs: [
          ...baseInputs,
          { label: 'Terminal NAV', value: String(terminal) },
          { label: 'Cash tab (today)', value: String(cashMeta.amount) },
          { label: 'Cash source', value: cashMeta.sourceLabel },
        ],
        rows: summary.symbols
          .filter((s) => s.ledgerShares !== 0)
          .map((s) => rowFromSymbol(s, s.marketValue ?? 0, perfCtx)),
        total: ctx.snapshotMwr.mwr ?? 0,
        warnings,
        mwrMeta: {
          terminalNav: terminal,
          cashSourceLabel: cashMeta.sourceLabel,
          mwr: ctx.snapshotMwr,
        },
      }
    }
    case 'optionsRealized':
    case 'optionsUnrealized':
    case 'optionsTotal': {
      if (!optionsAggregate) {
        return {
          metricId,
          title: 'Options P/L',
          formula: 'No option trades.',
          inputs: baseInputs,
          rows: [],
          total: 0,
          warnings,
        }
      }
      const pick =
        metricId === 'optionsRealized'
          ? (u: OptionsPerformanceAggregate) => u.realizedPnl
          : metricId === 'optionsUnrealized'
            ? (u: OptionsPerformanceAggregate) => u.unrealizedPnl
            : (u: OptionsPerformanceAggregate) => u.totalPnl
      const rows: PerformanceBreakdownRow[] = optionsAggregate.byUnderlying.map(
        (u) => ({
          key: u.underlying,
          kind: 'option' as const,
          symbol: u.underlying,
          shares: u.openContracts,
          costBasis: null,
          markPrice: null,
          markSource: null,
          fxNote: null,
          marketValue: null,
          contribution:
            metricId === 'optionsRealized'
              ? u.realizedPnl
              : metricId === 'optionsUnrealized'
                ? u.unrealizedPnl
                : u.totalPnl,
        }),
      )
      return {
        metricId,
        title:
          metricId === 'optionsTotal' ? 'Options total P/L' : `Options ${metricId}`,
        formula: 'Per-OCC ledger rolled up by underlying.',
        inputs: baseInputs,
        rows,
        total: pick(optionsAggregate),
        warnings,
      }
    }
    default:
      return {
        metricId,
        title: metricId,
        formula: '',
        inputs: [],
        rows: [],
        total: 0,
        warnings,
      }
  }
}

export function breakdownTotalMatchesCard(
  breakdown: PerformanceMetricBreakdown,
  cardValue: number | null,
  tolerance = 0.02,
): boolean {
  if (cardValue == null || !Number.isFinite(cardValue)) return breakdown.total === 0
  if (breakdown.metricId === 'snapshotReturn' || breakdown.metricId === 'twr' || breakdown.metricId === 'mwr') {
    return Math.abs(breakdown.total - cardValue) < tolerance
  }
  return Math.abs(breakdown.total - cardValue) < tolerance
}