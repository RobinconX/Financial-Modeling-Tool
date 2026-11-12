/** Whether portfolio value actuals + money-in are shared across books or per book. */

export const PORTFOLIO_ACTUALS_MODE_KEY = 'grok-lab.portfolio-actuals-mode'

export type PortfolioActualsMode = 'shared' | 'perPortfolio'

let memoryMode: PortfolioActualsMode | null = null

export function parsePortfolioActualsMode(raw: unknown): PortfolioActualsMode | undefined {
  if (raw === 'shared' || raw === 'perPortfolio') return raw
  return undefined
}

export function getPortfolioActualsMode(): PortfolioActualsMode {
  try {
    const v = localStorage.getItem(PORTFOLIO_ACTUALS_MODE_KEY)
    if (v === 'shared' || v === 'perPortfolio') return v
  } catch {
    /* ignore */
  }
  return memoryMode ?? 'shared'
}

export function applyPortfolioActualsModeSetting(mode: PortfolioActualsMode): void {
  memoryMode = mode
  try {
    localStorage.setItem(PORTFOLIO_ACTUALS_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}
