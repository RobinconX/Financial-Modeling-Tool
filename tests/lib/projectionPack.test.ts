import { describe, expect, it } from 'vitest'
import { parseSaveFile, wrapSnapshotAsCatalog } from '../../src/lib/accountCatalog'
import { emptyAppData, type AppDataSnapshot } from '../../src/lib/appDataSnapshot'
import {
  buildProjectionPack,
  defaultImportSelection,
  formatImportMessage,
  mergeImportedScenarios,
  parseProjectionFile,
  projectionPackFilename,
  uniqueImportedName,
  type ProjectionCandidate,
} from '../../src/lib/projectionPack'
import type { SavedScenario } from '../../src/types'

function sc(
  partial: Partial<SavedScenario> & Pick<SavedScenario, 'id' | 'symbol' | 'name'>,
): SavedScenario {
  return {
    companyName: null,
    currency: 'USD',
    currentPrice: 10,
    currentMarketCap: 1000,
    sharesOutstanding: 100,
    mcapOverride: null,
    easyRows: [{ id: 'e1', year: 2030, projectedMarketCap: 2_000 }],
    advancedRows: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  }
}

function snap(partial?: Partial<AppDataSnapshot>): AppDataSnapshot {
  return { ...emptyAppData(), exportedAt: '2026-01-01T00:00:00.000Z', ...partial }
}

describe('buildProjectionPack', () => {
  it('packs the selected scenarios and tags a single ticker', () => {
    const pack = buildProjectionPack([
      sc({ id: 'a', symbol: 'NVDA', name: 'Base' }),
      sc({ id: 'b', symbol: 'NVDA', name: 'Bull' }),
    ])
    expect(pack.kind).toBe('grok-lab-projections')
    expect(pack.symbol).toBe('NVDA')
    expect(pack.scenarios.map((s) => s.name)).toEqual(['Base', 'Bull'])
  })

  it('packs mixed tickers in one file', () => {
    const pack = buildProjectionPack([
      sc({ id: 'a', symbol: 'NVDA', name: 'Base' }),
      sc({ id: 'c', symbol: 'AAPL', name: 'Base' }),
    ])
    expect(pack.symbol).toBeNull()
    expect(pack.scenarios.map((s) => s.symbol)).toEqual(['NVDA', 'AAPL'])
  })

  it('names a one-case file after the scenario', () => {
    const pack = buildProjectionPack([sc({ id: 'a', symbol: 'NVDA', name: 'Bull' })])
    expect(projectionPackFilename(pack)).toBe('NVDA-Bull.json')
  })

  it('names a same-ticker multi-case file as projections', () => {
    const pack = buildProjectionPack([
      sc({ id: 'a', symbol: 'NVDA', name: 'Base' }),
      sc({ id: 'b', symbol: 'NVDA', name: 'Bull' }),
    ])
    expect(projectionPackFilename(pack)).toBe('NVDA-projections.json')
  })

  it('names a mixed-ticker file projections.json', () => {
    const pack = buildProjectionPack([
      sc({ id: 'a', symbol: 'NVDA', name: 'Base' }),
      sc({ id: 'c', symbol: 'AAPL', name: 'Base' }),
    ])
    expect(projectionPackFilename(pack)).toBe('projections.json')
  })
})

describe('parseProjectionFile', () => {
  it('reads a pack', () => {
    const pack = buildProjectionPack([sc({ id: 'a', symbol: 'NVDA', name: 'Bull' })])
    const parsed = parseProjectionFile(pack)
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.candidates).toHaveLength(1)
    expect(parsed.candidates[0]!.scenario.name).toBe('Bull')
    expect(parsed.candidates[0]!.scenario.symbol).toBe('NVDA')
  })

  it('reads scenarios from a one-account save', () => {
    const parsed = parseProjectionFile(
      snap({
        scenarios: [
          sc({ id: 'a', symbol: 'NVDA', name: 'Base' }),
          sc({ id: 'b', symbol: 'AAPL', name: 'Base' }),
        ],
      }),
    )
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.candidates.map((c) => `${c.scenario.symbol}·${c.scenario.name}`)).toEqual([
      'NVDA·Base',
      'AAPL·Base',
    ])
  })

  it('flattens a multi-account save and labels the account', () => {
    const a = wrapSnapshotAsCatalog(
      snap({ scenarios: [sc({ id: 'a', symbol: 'NVDA', name: 'Mine' })] }),
      'Mine',
      'id-a',
    )
    const b = wrapSnapshotAsCatalog(
      snap({ scenarios: [sc({ id: 'b', symbol: 'NVDA', name: 'Friend' })] }),
      'Friend',
      'id-b',
    )
    const parsed = parseProjectionFile({
      version: 2,
      selectedId: 'id-a',
      accounts: [...a.accounts, ...b.accounts],
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.candidates).toHaveLength(2)
    expect(parsed.candidates.map((c) => c.accountName)).toEqual(['Mine', 'Friend'])
  })

  it('reads a mixed-ticker pack', () => {
    const pack = buildProjectionPack([
      sc({ id: 'a', symbol: 'NVDA', name: 'Bull' }),
      sc({ id: 'b', symbol: 'AAPL', name: 'Base' }),
    ])
    const parsed = parseProjectionFile(pack)
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.candidates.map((c) => `${c.scenario.symbol}·${c.scenario.name}`)).toEqual([
      'NVDA·Bull',
      'AAPL·Base',
    ])
  })

  it('errors on an empty pack', () => {
    expect(parseProjectionFile(buildProjectionPack([]))).toMatchObject({
      error: expect.any(String),
    })
  })
})

describe('parseSaveFile vs pack', () => {
  it('does not treat a pack as an account save', () => {
    const pack = buildProjectionPack([sc({ id: 'a', symbol: 'NVDA', name: 'Bull' })])
    const parsed = parseSaveFile(pack)
    expect('error' in parsed).toBe(true)
    if (!('error' in parsed)) return
    expect(parsed.error).toMatch(/Analyze/i)
  })
})

describe('uniqueImportedName / merge', () => {
  it('keeps the file name when it is free', () => {
    expect(uniqueImportedName([], 'NVDA', 'Bull')).toBe('Bull')
    const { imported, next } = mergeImportedScenarios(
      [],
      [sc({ id: 'src', symbol: 'NVDA', name: 'Bull' })],
    )
    expect(imported[0]!.name).toBe('Bull')
    expect(imported[0]!.id).not.toBe('src')
    expect(next).toHaveLength(1)
  })

  it('never overwrites — suffixes (imported)', () => {
    const mine = sc({
      id: 'keep',
      symbol: 'NVDA',
      name: 'Bull',
      easyRows: [{ id: 'e', year: 2028, projectedMarketCap: 111 }],
    })
    const { next, imported } = mergeImportedScenarios(
      [mine],
      [sc({ id: 'src', symbol: 'NVDA', name: 'Bull' })],
    )
    expect(next).toHaveLength(2)
    expect(next[0]).toEqual(mine)
    expect(imported[0]!.name).toBe('Bull (imported)')
    expect(imported[0]!.id).not.toBe('keep')
    expect(imported[0]!.id).not.toBe('src')
    expect(findKeep(next).easyRows[0]!.projectedMarketCap).toBe(111)
  })

  it('numbers a second import of the same name', () => {
    const current = [
      sc({ id: 'a', symbol: 'NVDA', name: 'Bull' }),
      sc({ id: 'b', symbol: 'NVDA', name: 'Bull (imported)' }),
    ]
    const { imported } = mergeImportedScenarios(current, [
      sc({ id: 'c', symbol: 'NVDA', name: 'Bull' }),
    ])
    expect(imported[0]!.name).toBe('Bull (imported 2)')
  })

  it('uniques two incoming copies of the same name', () => {
    const { imported } = mergeImportedScenarios(
      [sc({ id: 'a', symbol: 'NVDA', name: 'Base' })],
      [
        sc({ id: 'b', symbol: 'NVDA', name: 'Base' }),
        sc({ id: 'c', symbol: 'NVDA', name: 'Base' }),
      ],
    )
    expect(imported.map((s) => s.name)).toEqual(['Base (imported)', 'Base (imported 2)'])
  })
})

describe('defaultImportSelection', () => {
  const nvda = cand('k1', sc({ id: 'a', symbol: 'NVDA', name: 'Base' }))
  const aapl = cand('k2', sc({ id: 'b', symbol: 'AAPL', name: 'Base' }))

  it('checks all when the file is one ticker', () => {
    const two = [
      cand('k1', sc({ id: 'a', symbol: 'NVDA', name: 'Base' })),
      cand('k2', sc({ id: 'b', symbol: 'NVDA', name: 'Bull' })),
    ]
    expect(defaultImportSelection(two, 'AAPL')).toEqual(['k1', 'k2'])
  })

  it('checks the open ticker when the save is mixed', () => {
    expect(defaultImportSelection([nvda, aapl], 'nvda')).toEqual(['k1'])
  })

  it('checks none when mixed and no open ticker match', () => {
    expect(defaultImportSelection([nvda, aapl], 'TSLA')).toEqual([])
    expect(defaultImportSelection([nvda, aapl], null)).toEqual([])
  })
})

describe('formatImportMessage', () => {
  it('names a single add', () => {
    expect(formatImportMessage([sc({ id: 'a', symbol: 'NVDA', name: 'Bull (imported)' })])).toBe(
      'Added NVDA · Bull (imported)',
    )
  })
})

function cand(key: string, scenario: SavedScenario): ProjectionCandidate {
  return { key, scenario, accountName: null }
}

function findKeep(next: SavedScenario[]): SavedScenario {
  const row = next.find((s) => s.id === 'keep')
  if (!row) throw new Error('expected original row')
  return row
}
