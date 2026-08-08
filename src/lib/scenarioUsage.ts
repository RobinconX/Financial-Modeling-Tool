import type { SavedPortfolio } from '../types'

export type ScenarioPortfolioUsage = {
  portfolioId: string
  portfolioName: string
  holdingCount: number
}

/** Portfolios (and holding counts) that reference a saved stock projection. */
export function portfoliosUsingScenario(
  scenarioId: string,
  portfolios: SavedPortfolio[],
): ScenarioPortfolioUsage[] {
  const out: ScenarioPortfolioUsage[] = []
  for (const p of portfolios) {
    const n = p.holdings.filter(
      (h) => h.manualOnly !== true && h.scenarioId === scenarioId,
    ).length
    if (n > 0) {
      out.push({
        portfolioId: p.id,
        portfolioName: p.name.trim() || 'Untitled portfolio',
        holdingCount: n,
      })
    }
  }
  return out
}

/** Confirm copy before deleting a projection (names linked portfolios when any). */
export function deleteScenarioConfirmMessage(
  symbol: string,
  name: string,
  usage: ScenarioPortfolioUsage[],
): string {
  const label = `${symbol} · ${name}`
  if (usage.length === 0) {
    return `Delete ${label}?`
  }
  const parts = usage.map(
    (u) =>
      `${u.portfolioName} (${u.holdingCount} holding${u.holdingCount === 1 ? '' : 's'})`,
  )
  const totalHoldings = usage.reduce((s, u) => s + u.holdingCount, 0)
  return (
    `This projection is used in: ${parts.join(', ')} ` +
    `(${totalHoldings} holding${totalHoldings === 1 ? '' : 's'} total).\n\n` +
    `Delete ${label} anyway? Holdings will show a missing scenario until re-linked.`
  )
}
