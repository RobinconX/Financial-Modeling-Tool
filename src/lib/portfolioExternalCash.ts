import type {
  PortfolioExternalCashFlow,
  PortfolioExternalCashState,
} from '../types'
import type { PerfDisplayContext } from './portfolioTradeFx'
import { convertAmountToDisplay, usdToChfForTradeFlow } from './portfolioTradeFx'

export const EXTERNAL_CASH_STATE_VERSION = 1 as const

export function emptyPortfolioExternalCash(): PortfolioExternalCashState {
  return { version: EXTERNAL_CASH_STATE_VERSION, flows: [] }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

export function normalizePortfolioExternalCash(
  raw: unknown,
): PortfolioExternalCashState {
  if (!isRecord(raw) || raw.version !== 1 || !Array.isArray(raw.flows)) {
    return emptyPortfolioExternalCash()
  }
  const flows: PortfolioExternalCashFlow[] = []
  for (const row of raw.flows) {
    if (!isRecord(row)) continue
    const portfolioId = String(row.portfolioId ?? '').trim()
    const flowDate = String(row.flowDate ?? '').slice(0, 10)
    const amount = Number(row.amount)
    const dir = row.direction === 'withdrawal' ? 'withdrawal' : 'deposit'
    const currency = row.currency === 'CHF' ? 'CHF' : 'USD'
    const id = String(row.id ?? '').trim()
    if (!id || !portfolioId || !flowDate || !Number.isFinite(amount) || amount <= 0) {
      continue
    }
    flows.push({
      id,
      portfolioId,
      flowDate,
      amount,
      direction: dir,
      currency,
      note: typeof row.note === 'string' ? row.note : undefined,
    })
  }
  flows.sort(
    (a, b) => a.flowDate.localeCompare(b.flowDate) || a.id.localeCompare(b.id),
  )
  return { version: 1, flows }
}

export function externalFlowsForPortfolio(
  state: PortfolioExternalCashState,
  portfolioId: string,
): PortfolioExternalCashFlow[] {
  return state.flows.filter((f) => f.portfolioId === portfolioId)
}

export function externalCashSignedInDisplay(
  flow: PortfolioExternalCashFlow,
  perfCtx: PerfDisplayContext,
): number {
  const amt = convertAmountToDisplay(
    flow.amount,
    flow.currency,
    perfCtx.displayCurrency,
    usdToChfForTradeFlow(flow.flowDate, perfCtx),
  )
  return flow.direction === 'deposit' ? amt : -amt
}

export function externalCfByDate(
  flows: readonly PortfolioExternalCashFlow[],
  perfCtx: PerfDisplayContext,
): Map<string, number> {
  const byDate = new Map<string, number>()
  for (const f of flows) {
    const signed = externalCashSignedInDisplay(f, perfCtx)
    byDate.set(f.flowDate, (byDate.get(f.flowDate) ?? 0) + signed)
  }
  return byDate
}

export function upsertExternalCashFlow(
  state: PortfolioExternalCashState,
  flow: PortfolioExternalCashFlow,
): PortfolioExternalCashState {
  const rest = state.flows.filter((f) => f.id !== flow.id)
  return { version: 1, flows: [...rest, flow] }
}

export function removeExternalCashFlow(
  state: PortfolioExternalCashState,
  id: string,
): PortfolioExternalCashState {
  return { version: 1, flows: state.flows.filter((f) => f.id !== id) }
}

/** Minimal CSV: flowDate, direction, amount, currency (optional), note (optional). */
export function parseExternalCashCsv(
  text: string,
  portfolioId: string,
): { rows: PortfolioExternalCashFlow[]; errors: string[] } {
  const errors: string[] = []
  const rows: PortfolioExternalCashFlow[] = []
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) {
    return { rows, errors: ['Need a header row and at least one data row'] }
  }
  const header = lines[0]!.toLowerCase().split(',').map((h) => h.trim())
  const idx = (name: string) => header.indexOf(name)
  const iDate = idx('flowdate') >= 0 ? idx('flowdate') : idx('date')
  const iDir = idx('direction') >= 0 ? idx('direction') : idx('type')
  const iAmt = idx('amount')
  const iCur = idx('currency')
  const iNote = idx('note')
  if (iDate < 0 || iDir < 0 || iAmt < 0) {
    errors.push('CSV must include flowDate (or date), direction (or type), amount')
    return { rows, errors }
  }
  for (let line = 1; line < lines.length; line++) {
    const cols = lines[line]!.split(',').map((c) => c.trim())
    const flowDate = cols[iDate]?.slice(0, 10) ?? ''
    const directionRaw = (cols[iDir] ?? '').toLowerCase()
    const direction =
      directionRaw.startsWith('w') || directionRaw === 'withdrawal'
        ? 'withdrawal'
        : 'deposit'
    const amount = Math.abs(Number(cols[iAmt]))
    const currency = cols[iCur] === 'CHF' ? 'CHF' : 'USD'
    if (!flowDate || !Number.isFinite(amount) || amount <= 0) {
      errors.push(`Row ${line + 1}: invalid date or amount`)
      continue
    }
    rows.push({
      id: crypto.randomUUID(),
      portfolioId,
      flowDate,
      amount,
      direction,
      currency,
      note: iNote >= 0 ? cols[iNote] || undefined : undefined,
    })
  }
  return { rows, errors }
}