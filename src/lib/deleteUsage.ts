import type {
  OverviewScenario,
  OverviewSeries,
  SavedComparable,
  SavedPortfolio,
  SavedScenario,
} from '../types'

/** One place elsewhere in the app that references the item being deleted. */
export type DeleteUsageRef = {
  where: string
  detail: string
}

export type DeleteUsage = {
  refs: DeleteUsageRef[]
}

function portfolioLabel(p: SavedPortfolio): string {
  return p.name.trim() || 'Untitled portfolio'
}

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
        portfolioName: portfolioLabel(p),
        holdingCount: n,
      })
    }
  }
  return out
}

export type ComparableScenarioUsage = {
  comparableId: string
  comparableName: string
  entryCount: number
}

/** Comparables sets that include a projection scenario. */
export function comparablesUsingScenario(
  scenarioId: string,
  comparables: SavedComparable[],
): ComparableScenarioUsage[] {
  const out: ComparableScenarioUsage[] = []
  for (const c of comparables) {
    const n = c.entries.filter((e) => e.scenarioId === scenarioId).length
    if (n > 0) {
      out.push({
        comparableId: c.id,
        comparableName: c.name.trim() || 'Untitled set',
        entryCount: n,
      })
    }
  }
  return out
}

function seriesLabel(s: OverviewSeries): string {
  const name = s.name.trim()
  if (name) return name
  if (s.type === 'portfolio') return 'Portfolio series'
  if (s.type === 'savings') return 'Savings series'
  if (s.type === 'incomeLeftover') return 'Leftover'
  return 'Other series'
}

function collectIncomeCostBindings(
  overviewScenarios: OverviewScenario[],
  incomeCostScenarioId: string,
): DeleteUsageRef[] {
  const refs: DeleteUsageRef[] = []
  for (const sc of overviewScenarios) {
    for (const s of sc.series) {
      const bindings = s.yearBindings ?? []
      const hits = bindings.filter((b) => b.incomeCostScenarioId === incomeCostScenarioId)
      if (hits.length > 0) {
        const years = [...new Set(hits.map((b) => b.year))].sort((a, b) => a - b)
        refs.push({
          where: `Overview · ${sc.name.trim() || 'Untitled'} · ${seriesLabel(s)}`,
          detail:
            years.length === 1
              ? `Budget binding for ${years[0]}`
              : `Budget bindings for ${years.join(', ')}`,
        })
      }
      if (s.incomeCostScenarioId === incomeCostScenarioId) {
        refs.push({
          where: `Overview · ${sc.name.trim() || 'Untitled'} · ${seriesLabel(s)}`,
          detail: 'Legacy budget scenario link',
        })
      }
    }
    const runway = sc.runway?.periods ?? []
    for (const p of runway) {
      if (p.incomeCostScenarioId === incomeCostScenarioId) {
        refs.push({
          where: `Overview · ${sc.name.trim() || 'Untitled'} · Runway`,
          detail: `Period from ${p.startYear}`,
        })
      }
    }
  }
  return refs
}

function collectPortfolioSurplusRefs(
  portfolios: SavedPortfolio[],
  incomeCostScenarioId: string,
): DeleteUsageRef[] {
  const refs: DeleteUsageRef[] = []
  for (const p of portfolios) {
    for (const d of p.deposits) {
      if (d.source === 'surplus' && d.surplusScenarioId === incomeCostScenarioId) {
        const label = d.isOpening ? 'Opening cash' : `Cash deposit (${d.year})`
        refs.push({
          where: `Portfolio · ${portfolioLabel(p)}`,
          detail: `Surplus link · ${label}`,
        })
      }
    }
    const per = p.perpetualYearlyDeposit
    if (
      per?.source === 'surplus' &&
      per.surplusScenarioId === incomeCostScenarioId
    ) {
      refs.push({
        where: `Portfolio · ${portfolioLabel(p)}`,
        detail: 'Surplus link · Recurring cash',
      })
    }
  }
  return refs
}

/** Everywhere a Budget (income/cost) scenario is still referenced. */
export function incomeCostScenarioUsage(
  incomeCostScenarioId: string,
  portfolios: SavedPortfolio[],
  overviewScenarios: OverviewScenario[],
): DeleteUsage {
  const refs = [
    ...collectPortfolioSurplusRefs(portfolios, incomeCostScenarioId),
    ...collectIncomeCostBindings(overviewScenarios, incomeCostScenarioId),
  ]
  return { refs }
}

/** Overview asset series tied to a portfolio scenario. */
export function portfolioScenarioUsage(
  portfolioId: string,
  overviewScenarios: OverviewScenario[],
): DeleteUsage {
  const refs: DeleteUsageRef[] = []
  for (const sc of overviewScenarios) {
    for (const s of sc.series) {
      if (s.type === 'portfolio' && s.portfolioId === portfolioId) {
        refs.push({
          where: `Overview · ${sc.name.trim() || 'Untitled'}`,
          detail: `Asset series · ${seriesLabel(s)}`,
        })
      }
    }
  }
  return { refs }
}

/** Overview savings series tied to a savings account. */
export function savingsAccountUsage(
  accountId: string,
  overviewScenarios: OverviewScenario[],
): DeleteUsage {
  const refs: DeleteUsageRef[] = []
  for (const sc of overviewScenarios) {
    for (const s of sc.series) {
      if (s.type === 'savings' && s.savingsAccountId === accountId) {
        refs.push({
          where: `Overview · ${sc.name.trim() || 'Untitled'}`,
          detail: `Savings series · ${seriesLabel(s)}`,
        })
      }
    }
  }
  return { refs }
}

/** Holdings and comparables using a stock projection scenario. */
export function stockProjectionScenarioUsage(
  scenarioId: string,
  portfolios: SavedPortfolio[],
  comparables: SavedComparable[],
): DeleteUsage {
  const refs: DeleteUsageRef[] = []
  for (const u of portfoliosUsingScenario(scenarioId, portfolios)) {
    refs.push({
      where: `Portfolio · ${u.portfolioName}`,
      detail: `${u.holdingCount} holding${u.holdingCount === 1 ? '' : 's'}`,
    })
  }
  for (const u of comparablesUsingScenario(scenarioId, comparables)) {
    refs.push({
      where: `Projections · Comparables · ${u.comparableName}`,
      detail: `${u.entryCount} row${u.entryCount === 1 ? '' : 's'}`,
    })
  }
  return { refs }
}

/** @deprecated Use stockProjectionScenarioUsage; kept for existing imports. */
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

/** Holding-specific delete detail (actions removed with the holding). */
export function portfolioHoldingDeleteDetail(
  holding: { symbol: string; scenarioId: string | null },
  scenario: SavedScenario | undefined,
  actionCount: number,
): DeleteUsage {
  const refs: DeleteUsageRef[] = []
  if (scenario) {
    refs.push({
      where: 'Projections',
      detail: `Linked to ${scenario.symbol} · ${scenario.name}`,
    })
  } else if (holding.scenarioId) {
    refs.push({
      where: 'Projections',
      detail: 'Linked projection missing',
    })
  }
  if (actionCount > 0) {
    refs.push({
      where: 'Portfolio',
      detail: `${actionCount} planned buy/sell action${actionCount === 1 ? '' : 's'} will be removed`,
    })
  }
  return { refs }
}
