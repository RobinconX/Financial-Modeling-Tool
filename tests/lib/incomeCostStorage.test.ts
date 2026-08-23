import { describe, expect, it } from 'vitest'
import { DEFAULT_SCENARIO_NAME } from '../../src/lib/incomeCost'
import { parseIncomeCostState } from '../../src/lib/incomeCostStorage'

describe('parseIncomeCostState empty scenario name', () => {
  it('keeps a blank-named scenario and its lines, using the create fallback name', () => {
    const state = parseIncomeCostState({
      version: 3,
      scenarios: [{ id: 's-blank', name: '', sortOrder: 0, year: 2026 }],
      lines: [
        {
          id: 'l1',
          scenarioId: 's-blank',
          kind: 'income',
          name: 'Salary',
          cadence: 'recurring',
          yearlyAmount: 120000,
        },
      ],
      draws: [],
    })

    expect(state.scenarios).toHaveLength(1)
    expect(state.scenarios[0]).toMatchObject({
      id: 's-blank',
      name: DEFAULT_SCENARIO_NAME,
      year: 2026,
    })
    expect(state.lines).toHaveLength(1)
    expect(state.lines[0]?.scenarioId).toBe('s-blank')
    expect(state.lines[0]?.yearlyAmount).toBe(120000)
  })

  it('treats whitespace-only names the same as empty', () => {
    const state = parseIncomeCostState({
      version: 2,
      scenarios: [{ id: 's-ws', name: '   ', sortOrder: 1, year: 2024 }],
      lines: [],
    })

    expect(state.scenarios[0]).toMatchObject({
      id: 's-ws',
      name: DEFAULT_SCENARIO_NAME,
      year: 2024,
    })
  })

  it('leaves a real name unchanged', () => {
    const state = parseIncomeCostState({
      version: 3,
      scenarios: [{ id: 's1', name: 'Lean', sortOrder: 0, year: 2025 }],
      lines: [],
      draws: [],
    })

    expect(state.scenarios[0]?.name).toBe('Lean')
  })
})
