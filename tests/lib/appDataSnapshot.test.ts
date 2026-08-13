import { describe, expect, it } from 'vitest'
import {
  parseAppDataSnapshot,
  APP_DATA_SNAPSHOT_VERSION,
} from '../../src/lib/appDataSnapshot'

describe('appDataSnapshot', () => {
  it('parses a minimal valid snapshot envelope', () => {
    const raw = {
      version: APP_DATA_SNAPSHOT_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      scenarios: [],
      portfolios: [],
      incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
      savings: { version: 1, accounts: [] },
      overview: { version: 2, scenarios: [], selectedScenarioId: null },
    }
    const parsed = parseAppDataSnapshot(raw)
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.version).toBe(1)
    expect(parsed.scenarios).toEqual([])
    expect(parsed.comparables).toEqual([])
  })

  it('rejects invalid payloads', () => {
    expect(parseAppDataSnapshot(null)).toMatchObject({ error: expect.any(String) })
    expect(parseAppDataSnapshot({})).toMatchObject({ error: expect.any(String) })
    expect(parseAppDataSnapshot({ version: 1, scenarios: [] })).toMatchObject({
      error: expect.any(String),
    })
  })
})
