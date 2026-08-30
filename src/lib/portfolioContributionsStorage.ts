import type { DisplayCurrency, PortfolioContributionsState } from '../types'
import { emptyPortfolioContributions } from './portfolioContributions'
import { queueAppDataChanged } from './linkedMirrorGate'

export const PORTFOLIO_CONTRIBUTIONS_KEY = 'grok-lab.portfolioContributions.v1'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function normalizeByYear(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(raw)) return out
  for (const [k, v] of Object.entries(raw)) {
    const y = Math.floor(Number(k))
    if (!Number.isFinite(y) || y < 1900 || y > 2200) continue
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) continue
    out[String(y)] = n
  }
  return out
}

export function normalizePortfolioContributions(raw: unknown): PortfolioContributionsState {
  if (!isRecord(raw)) return emptyPortfolioContributions()
  const currency: DisplayCurrency = raw.currency === 'CHF' ? 'CHF' : 'USD'
  return { version: 1, currency, byYear: normalizeByYear(raw.byYear) }
}

export function loadPortfolioContributions(): PortfolioContributionsState {
  try {
    const raw = localStorage.getItem(PORTFOLIO_CONTRIBUTIONS_KEY)
    if (!raw) return emptyPortfolioContributions()
    return normalizePortfolioContributions(JSON.parse(raw))
  } catch {
    return emptyPortfolioContributions()
  }
}

export function savePortfolioContributions(
  state: PortfolioContributionsState,
): { ok: true } | { ok: false; error: string } {
  try {
    const payload = normalizePortfolioContributions(state)
    localStorage.setItem(PORTFOLIO_CONTRIBUTIONS_KEY, JSON.stringify(payload))
    queueAppDataChanged()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Failed to save contributions' }
  }
}
