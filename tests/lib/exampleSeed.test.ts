import { describe, expect, it } from 'vitest'
import { isSnapshotPopulated } from '../../src/lib/accountCatalog'
import { parseExampleModel } from '../../src/lib/exampleSeed'

describe('example model', () => {
  it('parses as a valid populated v1 snapshot', () => {
    const parsed = parseExampleModel()
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.version).toBe(1)
    expect(parsed.scenarios.length).toBeGreaterThan(0)
    expect(parsed.portfolios.length).toBeGreaterThan(0)
    expect(parsed.incomeCost.lines.length).toBeGreaterThan(0)
    expect(parsed.savings.accounts.length).toBeGreaterThan(0)
    expect(parsed.overview.scenarios.length).toBeGreaterThan(0)
    expect(parsed.comparables.length).toBeGreaterThan(0)
    expect(parsed.annotations.length).toBeGreaterThan(0)
    expect(parsed.goals.length).toBeGreaterThan(0)
    expect(isSnapshotPopulated(parsed)).toBe(true)
  })

  it('links portfolio holdings to the example projection', () => {
    const parsed = parseExampleModel()
    if ('error' in parsed) throw new Error(parsed.error)
    const scenId = parsed.scenarios[0]!.id
    expect(parsed.portfolios[0]!.holdings.some((h) => h.scenarioId === scenId)).toBe(true)
    expect(parsed.comparables[0]!.entries[0]!.scenarioId).toBe(scenId)
  })
})
