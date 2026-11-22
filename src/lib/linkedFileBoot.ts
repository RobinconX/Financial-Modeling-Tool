import { hydrateOnStartup } from './accountCatalog'
import { remountApp } from './appRemount'
import {
  getBootLinkedFileName,
  linkedFileAccessUnavailableMessage,
  LINKED_FILE_BOOT_STEP_TIMEOUT_MS,
  LINKED_FILE_BOOT_PRERENDER_DEADLINE_MS,
  readLinkedSnapshotForStartup,
  reportLinkedFileStartupHydrateFailure,
  syncPeriodicLinkedSaves,
} from './linkedDataFile'
import { PromiseTimeoutError, withTimeout } from './promiseTimeout'

export type BootHydrateOutcome =
  | { status: 'applied' }
  | { status: 'none' }
  | { status: 'failed'; error: string; fileName?: string | null }
  | { status: 'timed_out' }

async function tryHydrateFromLinkedFile(): Promise<BootHydrateOutcome> {
  try {
    const snap = await readLinkedSnapshotForStartup({
      stepTimeoutMs: LINKED_FILE_BOOT_STEP_TIMEOUT_MS,
    })
    if (snap == null) return { status: 'none' }
    const fileName = getBootLinkedFileName()
    if ('error' in snap) {
      reportLinkedFileStartupHydrateFailure(snap.error, fileName)
      return { status: 'failed', error: snap.error, fileName }
    }
    const result = hydrateOnStartup(snap)
    if (!result.ok) {
      reportLinkedFileStartupHydrateFailure(result.error, fileName)
      return { status: 'failed', error: result.error, fileName }
    }
    syncPeriodicLinkedSaves()
    return { status: 'applied' }
  } catch (e) {
    const msg =
      e instanceof Error ? e.message : 'Linked file hydrate failed unexpectedly'
    const fileName = getBootLinkedFileName()
    reportLinkedFileStartupHydrateFailure(msg, fileName)
    return { status: 'failed', error: msg, fileName }
  }
}

/**
 * Pre-render attempt: bounded so React always mounts even when FS/IDB hangs.
 */
export async function runPreRenderBootHydrate(): Promise<BootHydrateOutcome> {
  try {
    return await withTimeout(
      tryHydrateFromLinkedFile(),
      LINKED_FILE_BOOT_PRERENDER_DEADLINE_MS,
      'boot-prerender-hydrate',
    )
  } catch (e) {
    if (e instanceof PromiseTimeoutError) {
      const fileName = getBootLinkedFileName()
      const msg = linkedFileAccessUnavailableMessage('reconnect in Settings')
      reportLinkedFileStartupHydrateFailure(msg, fileName)
      return { status: 'timed_out' }
    }
  }
  return { status: 'failed', error: 'Unexpected boot hydrate error' }
}

/**
 * After first paint: retry hydrate when pre-render timed out or could not read yet.
 */
export function schedulePostRenderBootHydrate(prerender: BootHydrateOutcome): void {
  if (prerender.status === 'applied') return
  void (async () => {
    const outcome = await tryHydrateFromLinkedFile()
    if (outcome.status === 'applied') remountApp()
  })()
}