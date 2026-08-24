import { describe, expect, it } from 'vitest'
import {
  isSnapshotPopulated,
  nextAccountName,
  parseSaveFile,
  resolveStartupSave,
  serializeSaveFile,
  suggestedImportName,
  wrapSnapshotAsCatalog,
} from '../../src/lib/accountCatalog'
import { APP_DATA_SNAPSHOT_VERSION, type AppDataSnapshot } from '../../src/lib/appDataSnapshot'

function snap(partial?: Partial<AppDataSnapshot>): AppDataSnapshot {
  return {
    version: APP_DATA_SNAPSHOT_VERSION,
    exportedAt: '2026-01-01T00:00:00.000Z',
    scenarios: [],
    portfolios: [],
    incomeCost: { version: 3, scenarios: [], lines: [], draws: [] },
    savings: { version: 1, accounts: [] },
    overview: { version: 2, scenarios: [], selectedScenarioId: null },
    comparables: [],
    annotations: [],
    goals: [],
    portfolioContributions: { version: 1, currency: 'USD', byYear: {} },
    ...partial,
  }
}

describe('parseSaveFile', () => {
  it('reads a v1 snapshot as one model', () => {
    const parsed = parseSaveFile(snap())
    expect('error' in parsed).toBe(false)
    if ('error' in parsed) return
    expect(parsed.kind).toBe('snapshot')
    if (parsed.kind === 'snapshot') {
      expect(parsed.snapshot.version).toBe(1)
    }
  })

  it('reads a v2 multi-account save', () => {
    const a = wrapSnapshotAsCatalog(snap(), 'Mine', 'id-a')
    const b = wrapSnapshotAsCatalog(snap({ exportedAt: '2026-02-01T00:00:00.000Z' }), 'Client', 'id-b')
    const parsed = parseSaveFile({
      version: 2,
      selectedId: 'id-b',
      accounts: [...a.accounts, ...b.accounts],
    })
    expect('error' in parsed).toBe(false)
    if ('error' in parsed || parsed.kind !== 'catalog') return
    expect(parsed.catalog.accounts).toHaveLength(2)
    expect(parsed.catalog.selectedId).toBe('id-b')
    expect(parsed.catalog.accounts[1]?.name).toBe('Client')
  })

  it('rejects empty v2 accounts', () => {
    expect(parseSaveFile({ version: 2, selectedId: 'x', accounts: [] })).toMatchObject({
      error: expect.any(String),
    })
  })
})

describe('serializeSaveFile', () => {
  it('writes v1 when there is one account', () => {
    const cat = wrapSnapshotAsCatalog(snap(), 'Mine', 'id-a')
    const out = serializeSaveFile(cat) as AppDataSnapshot
    expect(out.version).toBe(1)
    expect(out.scenarios).toEqual([])
    expect('accounts' in out).toBe(false)
  })

  it('writes v2 envelope when there are several accounts', () => {
    const cat = wrapSnapshotAsCatalog(snap(), 'Mine', 'id-a')
    cat.accounts.push({ id: 'id-b', name: 'Other', snapshot: snap() })
    const out = serializeSaveFile(cat) as { version: number; accounts: unknown[] }
    expect(out.version).toBe(2)
    expect(out.accounts).toHaveLength(2)
  })
})

describe('startup hydrate', () => {
  it('treats projections or portfolios as populated', () => {
    expect(isSnapshotPopulated(snap())).toBe(false)
    expect(
      isSnapshotPopulated(
        snap({
          scenarios: [{ id: 's', symbol: 'AAPL', name: 'Base' } as AppDataSnapshot['scenarios'][number]],
        }),
      ),
    ).toBe(true)
    expect(
      isSnapshotPopulated(
        snap({
          portfolios: [{ id: 'p', name: 'Main' } as AppDataSnapshot['portfolios'][number]],
        }),
      ),
    ).toBe(true)
  })

  it('keeps localStorage when the linked v1 file is empty', () => {
    const live = snap({
      scenarios: [{ id: 's', symbol: 'AAPL', name: 'Base' } as AppDataSnapshot['scenarios'][number]],
    })
    const resolved = resolveStartupSave({ kind: 'snapshot', snapshot: snap() }, live)
    expect(resolved.kind).toBe('snapshot')
    if (resolved.kind === 'snapshot') {
      expect(resolved.snapshot.scenarios).toHaveLength(1)
    }
  })

  it('uses the linked file when it has data', () => {
    const live = snap({
      scenarios: [{ id: 'old', symbol: 'MSFT', name: 'Old' } as AppDataSnapshot['scenarios'][number]],
    })
    const file = snap({
      scenarios: [{ id: 'new', symbol: 'AAPL', name: 'New' } as AppDataSnapshot['scenarios'][number]],
    })
    const resolved = resolveStartupSave({ kind: 'snapshot', snapshot: file }, live)
    expect(resolved.kind).toBe('snapshot')
    if (resolved.kind === 'snapshot') {
      expect(resolved.snapshot.scenarios[0]?.id).toBe('new')
    }
  })

  it('opens a populated account if the save file selected an empty one', () => {
    const mine = snap({
      portfolios: [{ id: 'p', name: 'Main' } as AppDataSnapshot['portfolios'][number]],
    })
    const empty = snap()
    const catalog = {
      version: 2 as const,
      selectedId: 'empty',
      accounts: [
        { id: 'mine', name: 'Mine', snapshot: mine },
        { id: 'empty', name: 'Account 2', snapshot: empty },
      ],
    }
    const resolved = resolveStartupSave({ kind: 'catalog', catalog }, snap())
    expect(resolved.kind).toBe('catalog')
    if (resolved.kind === 'catalog') {
      expect(resolved.catalog.selectedId).toBe('mine')
    }
  })
})

describe('nextAccountName / suggestedImportName', () => {
  it('skips taken Account N names', () => {
    expect(nextAccountName(['Mine'])).toBe('Account 2')
    expect(nextAccountName(['Mine', 'Account 2'])).toBe('Account 3')
  })

  it('derives a name from an export filename', () => {
    expect(suggestedImportName('financial-model-export-2026-08-23.json')).toBe('Imported')
    expect(suggestedImportName('robin-model.json')).toBe('robin-model')
  })
})
