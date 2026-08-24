import exampleModel from '../data/example-model.json'
import {
  applyExampleSnapshot,
  ensureCatalog,
  isSnapshotPopulated,
  loadCatalog,
  replaceSelectedSnapshot,
  saveCatalog,
} from './accountCatalog'
import { collectAppData, parseAppDataSnapshot } from './appDataSnapshot'
import { getLinkedFileStatus } from './linkedDataFile'

export const EXAMPLE_SEED_FLAG_KEY = 'grok-lab.example-seeded.v1'

function readSeededFlag(): boolean {
  try {
    return localStorage.getItem(EXAMPLE_SEED_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

function writeSeededFlag(): void {
  try {
    localStorage.setItem(EXAMPLE_SEED_FLAG_KEY, '1')
  } catch {
    /* ignore */
  }
}

export function parseExampleModel() {
  return parseAppDataSnapshot(exampleModel)
}

/**
 * First visit only: empty browser, no linked file → load the bundled Example model.
 * Linked file and any populated localStorage always win.
 */
export async function maybeSeedExample(): Promise<void> {
  if (readSeededFlag()) return

  const live = collectAppData()
  if (isSnapshotPopulated(live)) {
    writeSeededFlag()
    return
  }

  const cat = loadCatalog()
  if (cat?.accounts.some((a) => isSnapshotPopulated(a.snapshot))) {
    writeSeededFlag()
    return
  }

  try {
    const status = await getLinkedFileStatus()
    if (status.linked) {
      writeSeededFlag()
      return
    }
  } catch {
    /* treat as unlinked */
  }

  const parsed = parseExampleModel()
  if ('error' in parsed) {
    console.warn('[data] Example model is invalid:', parsed.error)
    return
  }

  const applied = applyExampleSnapshot(parsed)
  if (!applied.ok) {
    console.warn('[data] Example seed failed:', applied.error)
    return
  }
  writeSeededFlag()
}

/** Fill an empty account with the bundled Example snapshot. Does not rename it. */
export function fillAccountWithExample(
  accountId?: string | null,
): { ok: true } | { ok: false; error: string } {
  const parsed = parseExampleModel()
  if ('error' in parsed) return { ok: false, error: parsed.error }

  const cat = ensureCatalog()
  const id =
    accountId && cat.accounts.some((a) => a.id === accountId)
      ? accountId
      : cat.selectedId
  const target = cat.accounts.find((a) => a.id === id)
  if (!target) return { ok: false, error: 'Unknown account' }

  const current = id === cat.selectedId ? collectAppData() : target.snapshot
  if (isSnapshotPopulated(current)) {
    return { ok: false, error: 'This account already has data' }
  }

  if (id === cat.selectedId) {
    return replaceSelectedSnapshot(parsed)
  }

  saveCatalog({
    ...cat,
    accounts: cat.accounts.map((a) =>
      a.id === id ? { ...a, snapshot: parsed } : a,
    ),
  })
  return { ok: true }
}
