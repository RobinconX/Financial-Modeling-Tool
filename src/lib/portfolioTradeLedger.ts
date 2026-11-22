import type { DisplayCurrency, PortfolioTrade, PortfolioTradeEvent } from '../types'
import { optionIsExpired, parseOccSymbol } from './optionContract'
import { convertAmountToDisplay } from './portfolioTradeFx'
import type { PerfDisplayContext } from './portfolioTradeFx'

export function tradeInstrument(t: PortfolioTrade): 'equity' | 'option' {
  return t.instrument === 'option' ? 'option' : 'equity'
}

export function tradeEvent(t: PortfolioTrade): PortfolioTradeEvent {
  const e = t.event
  if (e === 'expire' || e === 'assign' || e === 'exercise') return e
  return 'trade'
}

export function tradeMultiplier(t: PortfolioTrade): number {
  if (tradeInstrument(t) !== 'option') return 1
  const m = t.multiplier
  if (m != null && Number.isFinite(m) && m > 0) return m
  return 100
}

export function tradeUnderlying(t: PortfolioTrade): string | null {
  if (t.underlying?.trim()) return t.underlying.trim().toUpperCase()
  if (tradeInstrument(t) === 'option') {
    return parseOccSymbol(t.symbol)?.underlying ?? null
  }
  return t.symbol.toUpperCase()
}

function feeAmountDisplay(
  t: PortfolioTrade,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): number {
  const f = t.fees ?? 0
  if (f <= 0) return 0
  const feeCur = t.feesCurrency ?? t.currency ?? 'USD'
  return convertAmountToDisplay(f, feeCur, displayCurrency, usdToChf)
}

function premiumDisplay(
  t: PortfolioTrade,
  displayCurrency: DisplayCurrency,
  usdToChf: number | null,
): number {
  const book = t.currency ?? 'USD'
  return convertAmountToDisplay(t.price, book, displayCurrency, usdToChf)
}

export type LedgerSnapshot = {
  shares: number
  costBasis: number
  realizedPnl: number
  grossBuys: number
  grossPremiumReceived: number
  instrument: 'equity' | 'option'
}

function isLifecycleClose(t: PortfolioTrade): boolean {
  const e = tradeEvent(t)
  return e === 'expire' || e === 'assign' || e === 'exercise'
}

function applySellRow(
  snap: LedgerSnapshot,
  contracts: number,
  premiumPerShare: number,
  mult: number,
  fees: number,
  instrument: 'equity' | 'option',
): void {
  let remaining = contracts
  if (remaining <= 0) return
  if (snap.shares > 0) {
    const closeQty = Math.min(remaining, snap.shares)
    if (closeQty > 0) {
      const avg = snap.costBasis / snap.shares
      const proceeds =
        closeQty * premiumPerShare * mult - (fees * closeQty) / contracts
      const costRemoved = avg * closeQty
      snap.realizedPnl += proceeds - costRemoved
      snap.shares -= closeQty
      snap.costBasis -= costRemoved
      remaining -= closeQty
    }
  }
  if (remaining <= 0) return
  if (instrument !== 'option') return
  const credit =
    remaining * premiumPerShare * mult - (fees * remaining) / contracts
  snap.grossPremiumReceived += credit
  snap.shares -= remaining
  snap.costBasis += credit
}

function applyBuyRow(
  snap: LedgerSnapshot,
  contracts: number,
  premiumPerShare: number,
  mult: number,
  fees: number,
  instrument: 'equity' | 'option',
): void {
  let remaining = contracts
  if (remaining <= 0) return
  if (instrument === 'option' && snap.shares < 0) {
    const closeQty = Math.min(remaining, -snap.shares)
    if (closeQty > 0) {
      const avgCredit = snap.costBasis / Math.abs(snap.shares)
      const costRemoved = avgCredit * closeQty
      const debit =
        closeQty * premiumPerShare * mult + (fees * closeQty) / contracts
      snap.realizedPnl += costRemoved - debit
      snap.shares += closeQty
      snap.costBasis -= costRemoved
      remaining -= closeQty
    }
  }
  if (remaining <= 0) return
  if (snap.shares < 0) return
  const notional =
    remaining * premiumPerShare * mult + (fees * remaining) / contracts
  snap.grossBuys += notional
  snap.shares += remaining
  snap.costBasis += notional
}

function applyLifecycleRow(
  snap: LedgerSnapshot,
  contracts: number,
  pricePerShare: number,
  mult: number,
  fees: number,
): void {
  let remaining = contracts
  if (remaining <= 0) return
  if (snap.shares > 0) {
    const closeQty = Math.min(remaining, snap.shares)
    const avg = snap.costBasis / snap.shares
    const proceeds =
      closeQty * pricePerShare * mult - (fees * closeQty) / contracts
    const costRemoved = avg * closeQty
    snap.realizedPnl += proceeds - costRemoved
    snap.shares -= closeQty
    snap.costBasis -= costRemoved
    remaining -= closeQty
  } else if (snap.shares < 0) {
    const closeQty = Math.min(remaining, -snap.shares)
    const avgCredit = snap.costBasis / Math.abs(snap.shares)
    const costRemoved = avgCredit * closeQty
    const debit =
      closeQty * pricePerShare * mult + (fees * closeQty) / contracts
    snap.realizedPnl += costRemoved - debit
    snap.shares += closeQty
    snap.costBasis -= costRemoved
    remaining -= closeQty
  }
}

export function ledgerSnapshotAt(
  trades: PortfolioTrade[],
  asOfDate: string,
  perfCtx?: PerfDisplayContext,
): LedgerSnapshot {
  const display = perfCtx?.displayCurrency ?? 'USD'
  const usdToChf = perfCtx?.usdToChf ?? null
  const instrument =
    trades.find((t) => tradeInstrument(t) === 'option') != null ? 'option' : 'equity'

  const snap: LedgerSnapshot = {
    shares: 0,
    costBasis: 0,
    realizedPnl: 0,
    grossBuys: 0,
    grossPremiumReceived: 0,
    instrument,
  }

  const ordered = [...trades]
    .filter((t) => t.tradeDate <= asOfDate)
    .sort((a, b) => a.tradeDate.localeCompare(b.tradeDate) || a.id.localeCompare(b.id))

  for (const t of ordered) {
    const inst = tradeInstrument(t)
    const mult = tradeMultiplier(t)
    const fees = feeAmountDisplay(t, display, usdToChf)
    const px = isLifecycleClose(t) ? 0 : premiumDisplay(t, display, usdToChf)
    if (isLifecycleClose(t)) {
      applyLifecycleRow(snap, t.shares, px, mult, fees)
      continue
    }
    if (t.side === 'buy') {
      applyBuyRow(snap, t.shares, px, mult, fees, inst)
    } else {
      applySellRow(snap, t.shares, px, mult, fees, inst)
    }
  }
  return snap
}

export function returnDenominator(snap: LedgerSnapshot): number {
  if (snap.shares < 0) return snap.grossPremiumReceived
  if (snap.shares === 0 && snap.grossPremiumReceived > snap.grossBuys) {
    return snap.grossPremiumReceived
  }
  if (snap.grossBuys > 0) return snap.grossBuys
  return snap.grossPremiumReceived
}

export function computeLedgerPerformance(
  trades: PortfolioTrade[],
  markPricePerShare: number | null,
  perfCtx?: PerfDisplayContext,
): {
  symbol: string
  tradeCount: number
  shares: number
  costBasis: number
  realizedPnl: number
  grossBuys: number
  grossPremiumReceived: number
  markPrice: number | null
  marketValue: number | null
  unrealizedPnl: number | null
  totalPnl: number | null
  returnPct: number | null
} {
  if (trades.length === 0) {
    return {
      symbol: '',
      tradeCount: 0,
      shares: 0,
      costBasis: 0,
      realizedPnl: 0,
      grossBuys: 0,
      grossPremiumReceived: 0,
      markPrice: null,
      marketValue: null,
      unrealizedPnl: null,
      totalPnl: null,
      returnPct: null,
    }
  }
  const symbol = trades[0]!.symbol
  const snap = ledgerSnapshotAt(trades, '9999-12-31', perfCtx)
  const mult = tradeMultiplier(trades[0]!)
  let marketValue: number | null = null
  let unrealizedPnl: number | null = null
  if (snap.shares !== 0 && markPricePerShare != null) {
    marketValue = snap.shares * markPricePerShare * mult
    unrealizedPnl = marketValue - snap.costBasis
  } else if (snap.shares === 0) {
    unrealizedPnl = 0
  }
  const totalPnl =
    unrealizedPnl != null ? snap.realizedPnl + unrealizedPnl : snap.realizedPnl || null
  const denom = returnDenominator(snap)
  const returnPct = totalPnl != null && denom > 0 ? totalPnl / denom : null
  return {
    symbol,
    tradeCount: trades.length,
    ...snap,
    markPrice: markPricePerShare,
    marketValue,
    unrealizedPnl,
    totalPnl,
    returnPct,
  }
}

function dayAfter(isoDate: string): string {
  const t = Date.parse(`${isoDate}T12:00:00Z`)
  if (!Number.isFinite(t)) return isoDate
  const d = new Date(t + 86_400_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function withAutoExpireTrades(
  trades: PortfolioTrade[],
  asOfDate: string,
): PortfolioTrade[] {
  const byOcc = new Map<string, PortfolioTrade[]>()
  for (const t of trades) {
    if (tradeInstrument(t) !== 'option') continue
    const list = byOcc.get(t.symbol) ?? []
    list.push(t)
    byOcc.set(t.symbol, list)
  }
  const extras: PortfolioTrade[] = []
  for (const [occ, list] of byOcc) {
    const parsed = parseOccSymbol(occ)
    if (!parsed) continue
    if (!optionIsExpired(parsed.expiration, new Date(`${asOfDate}T12:00:00Z`))) {
      if (parsed.expiration >= asOfDate) continue
    }
    const expDayAfter = dayAfter(parsed.expiration)
    if (expDayAfter > asOfDate) continue
    const hasLifecycle = list.some(
      (t) =>
        t.tradeDate >= parsed.expiration &&
        (tradeEvent(t) === 'expire' ||
          tradeEvent(t) === 'assign' ||
          tradeEvent(t) === 'exercise'),
    )
    if (hasLifecycle) continue
    const snap = ledgerSnapshotAt(list, asOfDate)
    if (snap.shares === 0) continue
    const template = list[0]!
    extras.push({
      ...template,
      id: `auto-expire:${occ}`,
      tradeDate: expDayAfter,
      side: snap.shares > 0 ? 'sell' : 'buy',
      shares: Math.abs(snap.shares),
      price: 0,
      event: 'expire',
      note: template.note ?? 'Auto-expire',
    })
  }
  if (extras.length === 0) return trades
  return [...trades, ...extras].sort(
    (a, b) =>
      a.tradeDate.localeCompare(b.tradeDate) ||
      a.symbol.localeCompare(b.symbol) ||
      a.id.localeCompare(b.id),
  )
}

export type PerformanceScopeKey = {
  key: string
  label: string
  kind: 'portfolio' | 'equity' | 'option' | 'underlying'
}

export function performanceScopeKeys(trades: PortfolioTrade[]): PerformanceScopeKey[] {
  const underlyings = new Set<string>()
  const occs = new Set<string>()
  const equities = new Set<string>()
  for (const t of trades) {
    if (tradeInstrument(t) === 'option') {
      occs.add(t.symbol)
      const u = tradeUnderlying(t)
      if (u) underlyings.add(u)
    } else {
      equities.add(t.symbol)
    }
  }
  const out: PerformanceScopeKey[] = []
  for (const sym of [...equities].sort()) {
    out.push({ key: `eq:${sym}`, label: sym, kind: 'equity' })
  }
  for (const u of [...underlyings].sort()) {
    out.push({ key: `und:${u}`, label: `${u} options`, kind: 'underlying' })
  }
  for (const occ of [...occs].sort()) {
    const p = parseOccSymbol(occ)
    const label = p
      ? `${p.underlying} ${p.expiration} ${p.strike}${p.right}`
      : occ
    out.push({ key: `occ:${occ}`, label, kind: 'option' })
  }
  return out
}

export function tradesForPerformanceScope(
  trades: PortfolioTrade[],
  scopeKey: string | null,
): PortfolioTrade[] {
  if (!scopeKey) return trades
  if (scopeKey.startsWith('eq:')) {
    const sym = scopeKey.slice(3)
    return trades.filter(
      (t) => tradeInstrument(t) !== 'option' && t.symbol === sym,
    )
  }
  if (scopeKey.startsWith('und:')) {
    const u = scopeKey.slice(4)
    return trades.filter(
      (t) => tradeInstrument(t) === 'option' && tradeUnderlying(t) === u,
    )
  }
  if (scopeKey.startsWith('occ:')) {
    const occ = scopeKey.slice(4)
    return trades.filter((t) => t.symbol === occ)
  }
  return trades.filter((t) => t.symbol === scopeKey)
}