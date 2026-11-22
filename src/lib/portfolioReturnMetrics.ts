import type { PortfolioTrade } from '../types'
import type { PriceHistoryPoint } from './priceHistory'
import {
  convertAmountToDisplay,
  type PerfDisplayContext,
} from './portfolioTradeFx'
import {
  tradeEvent,
  tradeInstrument,
  tradeMultiplier,
  withAutoExpireTrades,
} from './portfolioTradeLedger'
import {
  closeOnOrBefore,
  computeTimeWeightedReturn,
  type TwrResult,
} from './portfolioPerformanceStats'
import { historyCloseInDisplay } from './portfolioTradeFx'
import { todayIsoDate } from './portfolioTrades'

function addUtcDays(isoDate: string, days: number): string {
  const t = Date.parse(`${isoDate}T12:00:00Z`)
  if (!Number.isFinite(t)) return isoDate
  const d = new Date(t + days * 86_400_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export type MwrResult = {
  mwr: number | null
  status: 'ok' | 'unavailable' | 'na'
  reason?: string
}

export type CapitalContributionStats = {
  currentNet: number
  peakNet: number
  grossBuys: number
}

function feeInDisplay(
  t: PortfolioTrade,
  display: PerfDisplayContext['displayCurrency'],
  usdToChf: number | null,
): number {
  const f = t.fees ?? 0
  if (f <= 0) return 0
  const feeCur = t.feesCurrency ?? t.currency ?? 'USD'
  return convertAmountToDisplay(f, feeCur, display, usdToChf)
}

function priceInDisplay(
  t: PortfolioTrade,
  display: PerfDisplayContext['displayCurrency'],
  usdToChf: number | null,
): number {
  return convertAmountToDisplay(t.price, t.currency ?? 'USD', display, usdToChf)
}

/** Cash leaving your pocket on this row (buys + fees, display currency). */
export function tradeBuyContribution(
  t: PortfolioTrade,
  perfCtx?: PerfDisplayContext,
): number {
  const display = perfCtx?.displayCurrency ?? 'USD'
  const usdToChf = perfCtx?.usdToChf ?? null
  if (tradeEvent(t) !== 'trade') return 0
  if (t.side !== 'buy') return 0
  const mult = tradeMultiplier(t)
  const fees = feeInDisplay(t, display, usdToChf)
  const px = priceInDisplay(t, display, usdToChf)
  return t.shares * px * mult + fees
}

/** Cash returning to you on this row (sells − fees, display currency). */
export function tradeSellProceeds(
  t: PortfolioTrade,
  perfCtx?: PerfDisplayContext,
): number {
  const display = perfCtx?.displayCurrency ?? 'USD'
  const usdToChf = perfCtx?.usdToChf ?? null
  if (tradeEvent(t) !== 'trade') return 0
  if (t.side !== 'sell') return 0
  const mult = tradeMultiplier(t)
  const fees = feeInDisplay(t, display, usdToChf)
  const px = priceInDisplay(t, display, usdToChf)
  return t.shares * px * mult - fees
}

/** Investor cash flow for XIRR: outflows negative, inflows positive. */
export function tradeInvestorCashFlow(
  t: PortfolioTrade,
  perfCtx?: PerfDisplayContext,
): number {
  if (tradeEvent(t) !== 'trade') return 0
  if (t.side === 'buy') return -tradeBuyContribution(t, perfCtx)
  return tradeSellProceeds(t, perfCtx)
}

export function computeCapitalContributionStats(
  trades: PortfolioTrade[],
  asOfDate: string = todayIsoDate(),
  perfCtx?: PerfDisplayContext,
): CapitalContributionStats {
  const expanded = withAutoExpireTrades(trades, asOfDate)
  const ordered = [...expanded]
    .filter((t) => t.tradeDate <= asOfDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id.localeCompare(b.id))
  let running = 0
  let peak = 0
  let grossBuys = 0
  for (const t of ordered) {
    const buy = tradeBuyContribution(t, perfCtx)
    const sell = tradeSellProceeds(t, perfCtx)
    if (buy > 0) {
      running += buy
      grossBuys += buy
      peak = Math.max(peak, running)
    }
    if (sell > 0) {
      running -= sell
      peak = Math.max(peak, running)
    }
  }
  return { currentNet: running, peakNet: peak, grossBuys }
}

type XirrFlow = { date: string; amount: number }

function yearFraction(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`)
  const b = Date.parse(`${to}T12:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return (b - a) / (365.25 * 24 * 60 * 60 * 1000)
}

function npv(flows: XirrFlow[], rate: number, baseDate: string): number {
  let sum = 0
  for (const f of flows) {
    const t = yearFraction(baseDate, f.date)
    sum += f.amount / (1 + rate) ** t
  }
  return sum
}

function npvDerivative(flows: XirrFlow[], rate: number, baseDate: string): number {
  let sum = 0
  for (const f of flows) {
    const t = yearFraction(baseDate, f.date)
    if (t === 0) continue
    sum -= (t * f.amount) / (1 + rate) ** (t + 1)
  }
  return sum
}

export function computeMoneyWeightedReturn(
  trades: PortfolioTrade[],
  terminalNav: number,
  asOfDate: string = todayIsoDate(),
  perfCtx?: PerfDisplayContext,
): MwrResult {
  const expanded = withAutoExpireTrades(trades, asOfDate)
  const active = expanded.filter((t) => t.tradeDate <= asOfDate)
  if (active.length === 0) return { mwr: null, status: 'na', reason: 'No trades' }

  const byDate = new Map<string, number>()
  for (const t of active) {
    if (tradeEvent(t) !== 'trade') continue
    const cf = tradeInvestorCashFlow(t, perfCtx)
    if (cf === 0) continue
    byDate.set(t.tradeDate, (byDate.get(t.tradeDate) ?? 0) + cf)
  }

  const flows: XirrFlow[] = [...byDate.entries()]
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (flows.length === 0 && !(terminalNav > 0)) {
    return { mwr: null, status: 'na', reason: 'No cash flows' }
  }

  if (terminalNav > 0) {
    const terminalDate = flows.some((f) => f.date === asOfDate)
      ? addUtcDays(asOfDate, 1)
      : asOfDate
    flows.push({ date: terminalDate, amount: terminalNav })
    flows.sort((a, b) => a.date.localeCompare(b.date))
  } else if (flows.every((f) => f.amount >= 0) || flows.every((f) => f.amount <= 0)) {
    return { mwr: null, status: 'unavailable', reason: 'No bracket for IRR' }
  }

  const baseDate = flows[0]!.date
  const spanYears = yearFraction(baseDate, flows[flows.length - 1]!.date)
  if (flows.length === 2 && spanYears > 0 && spanYears < 7 / 365.25) {
    return {
      mwr: null,
      status: 'unavailable',
      reason: 'holding too short to annualize',
    }
  }

  let rate = 0.1
  for (let i = 0; i < 64; i++) {
    const v = npv(flows, rate, baseDate)
    const d = npvDerivative(flows, rate, baseDate)
    if (!Number.isFinite(v) || !Number.isFinite(d) || Math.abs(d) < 1e-12) break
    const next = rate - v / d
    if (!Number.isFinite(next) || next <= -0.9999) break
    if (Math.abs(next - rate) < 1e-8) {
      rate = next
      break
    }
    rate = next
  }

  let finalNpv = npv(flows, rate, baseDate)
  if (!Number.isFinite(rate) || Math.abs(finalNpv) > 0.05) {
    let lo = -0.99
    let hi = 50
    let found = false
  for (let attempt = 0; attempt < 2 && !found; attempt++) {
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2
        const v = npv(flows, mid, baseDate)
        if (!Number.isFinite(v)) break
        if (Math.abs(v) < 1e-3) {
          rate = mid
          found = true
          break
        }
        const vLo = npv(flows, lo, baseDate)
        if (vLo * v <= 0) hi = mid
        else lo = mid
      }
      if (!found) hi = 500
    }
    if (!found) {
      return { mwr: null, status: 'unavailable', reason: 'IRR did not converge' }
    }
    finalNpv = npv(flows, rate, baseDate)
  }

  return { mwr: rate, status: 'ok' }
}

export function twrReasonLabel(r: TwrResult | undefined): string {
  if (!r || r.status === 'na') return 'n/a'
  if (r.status === 'unavailable') {
    return r.reason ? `n/a (${r.reason})` : 'n/a (missing price history)'
  }
  if (r.twr == null) return 'n/a'
  return `${(r.twr * 100).toFixed(1)}%`
}

export function mwrReasonLabel(r: MwrResult | undefined): string {
  if (!r || r.status === 'na') return 'n/a'
  if (r.status === 'unavailable') {
    return r.reason ? `n/a (${r.reason})` : 'n/a'
  }
  if (r.mwr == null) return 'n/a'
  return `${(r.mwr * 100).toFixed(1)}%`
}

/**
 * Whole-book (multi-symbol) equity TWR from daily closes and trade ledgers.
 */
export function computeEquityBookTimeWeightedReturn(
  tradesBySymbol: Map<string, PortfolioTrade[]>,
  histories: Record<string, PriceHistoryPoint[]>,
  asOfDate: string = todayIsoDate(),
  perfCtx?: PerfDisplayContext,
): TwrResult {
  const entries = [...tradesBySymbol.entries()].filter(
    ([, tr]) => tr.length > 0 && tradeInstrument(tr[0]!) !== 'option',
  )
  if (entries.length === 0) return { twr: null, status: 'na', reason: 'No equity trades' }
  if (entries.length === 1) {
    const [sym, trades] = entries[0]!
    const pts = histories[sym] ?? []
    return computeTimeWeightedReturn(trades, pts, asOfDate, perfCtx, sym)
  }

  const closeAt = (sym: string, date: string): number | null => {
    const raw = closeOnOrBefore(histories[sym] ?? [], date)
    if (raw == null) return null
    if (!perfCtx) return raw
    return historyCloseInDisplay(raw, sym, perfCtx)
  }

  const allDates = new Set<string>()
  for (const [, trades] of entries) {
    for (const t of trades) allDates.add(t.tradeDate)
  }
  const tradeDates = [...allDates].sort()
  if (tradeDates.length === 0) return { twr: null, status: 'na' }

  let anyOpen = false
  const sharesBySym = new Map<string, number>()
  for (const [sym, trades] of entries) {
    let sh = 0
    for (const t of trades) {
      if (t.side === 'buy') sh += t.shares
      else sh -= Math.min(t.shares, sh)
    }
    sharesBySym.set(sym, Math.max(0, sh))
    if (sh > 0) anyOpen = true
  }

  const timeline = [...tradeDates]
  if (anyOpen && asOfDate > tradeDates[tradeDates.length - 1]!) {
    timeline.push(asOfDate)
  } else if (!anyOpen) {
    /* terminal = last trade */
  }

  const byDateSym = new Map<string, Map<string, PortfolioTrade[]>>()
  for (const [sym, trades] of entries) {
    const sorted = [...trades].sort(
      (a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id.localeCompare(b.id),
    )
    for (const t of sorted) {
      const day = byDateSym.get(t.tradeDate) ?? new Map()
      const list = day.get(sym) ?? []
      list.push(t)
      day.set(sym, list)
      byDateSym.set(t.tradeDate, day)
    }
  }

  const portfolioMv = (date: string): number | null => {
    let total = 0
    for (const [sym, sh] of sharesBySym) {
      if (sh <= 0) continue
      const c = closeAt(sym, date)
      if (c == null) return null
      total += sh * c
    }
    return total
  }

  let linked = 1
  let prevDate: string | null = null

  for (const date of timeline) {
    if (prevDate != null && prevDate < date) {
      const mv0 = portfolioMv(prevDate)
      const mv1 = portfolioMv(date)
      if (mv0 == null || mv1 == null) {
        const missing = entries
          .filter(([sym, _]) => (sharesBySym.get(sym) ?? 0) > 0)
          .filter(([sym]) => closeAt(sym, date) == null || closeAt(sym, prevDate!) == null)
          .map(([sym]) => sym)
        return {
          twr: null,
          status: 'unavailable',
          reason:
            missing.length > 0
              ? `missing history for ${missing.slice(0, 3).join(', ')}`
              : 'missing price history',
        }
      }
      if (mv0 > 0) linked *= mv1 / mv0
    }

    const dayMap = byDateSym.get(date)
    if (dayMap && dayMap.size > 0) {
      const marks: Record<string, number> = {}
      for (const [sym] of entries) {
        const c = closeAt(sym, date)
        if (c == null) {
          return {
            twr: null,
            status: 'unavailable',
            reason: `missing history for ${sym}`,
          }
        }
        marks[sym] = c
      }

      let cf = 0
      let bmv = 0
      for (const [sym, sh] of sharesBySym) {
        bmv += sh * (marks[sym] ?? 0)
      }

      for (const [sym, list] of dayMap) {
        let sh = sharesBySym.get(sym) ?? 0
        for (const t of list) {
          if (t.side === 'buy') {
            cf += tradeBuyContribution(t, perfCtx)
            sh += t.shares
          } else {
            const s = Math.min(t.shares, sh)
            if (s > 0) {
              cf -= tradeSellProceeds(t, perfCtx)
            }
            sh -= s
          }
        }
        sharesBySym.set(sym, sh)
      }

      let emv = 0
      for (const [sym, sh] of sharesBySym) {
        emv += sh * (marks[sym] ?? 0)
      }
      if (bmv > 0) {
        const r = (emv - bmv - cf) / bmv
        if (Number.isFinite(r)) linked *= 1 + r
      }
    }

    prevDate = date
  }

  if (!Number.isFinite(linked) || linked <= 0) {
    return { twr: null, status: 'unavailable', reason: 'could not link periods' }
  }
  return { twr: linked - 1, status: 'ok' }
}