import type { SavedScenario } from '../types'

function scenarioPickerOrder(a: SavedScenario, b: SavedScenario): number {
  return (
    a.symbol.localeCompare(b.symbol, undefined, { sensitivity: 'base' }) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) ||
    a.id.localeCompare(b.id)
  )
}

/**
 * Pick a saved scenario for Compare Panel B when the user has not chosen one yet.
 * Prefers the most recently updated save that differs from Panel A; ties break by ticker/name order.
 */
export function pickComparePanelBScenario(
  scenarios: SavedScenario[],
  panelAId: string,
): string | null {
  const others = scenarios.filter((s) => s.id !== panelAId)
  if (others.length === 0) return null

  const chosen = [...others].sort((a, b) => {
    const byUpdated = b.updatedAt.localeCompare(a.updatedAt)
    if (byUpdated !== 0) return byUpdated
    return scenarioPickerOrder(a, b)
  })[0]

  return chosen?.id ?? null
}

export const COMPARE_PANEL_B_HINT =
  'Save another projection or use the Panel B picker — you need at least two saves to compare.'