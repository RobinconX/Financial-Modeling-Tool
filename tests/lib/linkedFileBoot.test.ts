import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as appRemount from '../../src/lib/appRemount'
import { runPreRenderBootHydrate, schedulePostRenderBootHydrate } from '../../src/lib/linkedFileBoot'
import {
  getLastLinkedFileSaveEvent,
  LINKED_FILE_BOOT_PRERENDER_DEADLINE_MS,
  linkedFileAccessUnavailableMessage,
  resetLinkedDataFileWriteStateForTests,
} from '../../src/lib/linkedDataFile'
import { createMockFileHandle } from './linkedDataFileWrite.test'

describe('linked file boot hydrate', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'test')
    resetLinkedDataFileWriteStateForTests(null)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('pre-render settles when queryPermission never settles', async () => {
    const handle = {
      ...createMockFileHandle('model.json'),
      queryPermission: () => new Promise<PermissionState>(() => {}),
    }
    resetLinkedDataFileWriteStateForTests(handle)

    vi.useFakeTimers()
    const hydratePromise = runPreRenderBootHydrate()
    await vi.advanceTimersByTimeAsync(LINKED_FILE_BOOT_PRERENDER_DEADLINE_MS + 2500)
    const outcome = await hydratePromise

    expect(['failed', 'timed_out']).toContain(outcome.status)
    expect(getLastLinkedFileSaveEvent().status).toBe('load-failed')
    expect(getLastLinkedFileSaveEvent().message).toContain('File access unavailable')
    expect(getLastLinkedFileSaveEvent().message).toContain('Brave')
  })

  it('schedulePostRenderBootHydrate remounts after a later successful read', async () => {
    let attempts = 0
    const handle = {
      ...createMockFileHandle('model.json'),
      queryPermission: async () => {
        attempts += 1
        return attempts >= 2 ? ('granted' as const) : ('prompt' as const)
      },
    }
    resetLinkedDataFileWriteStateForTests(handle)
    const remountSpy = vi.spyOn(appRemount, 'remountApp').mockImplementation(() => {})

    schedulePostRenderBootHydrate({
      status: 'failed',
      error: 'File access needed — open Settings and use Allow file access',
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(remountSpy).not.toHaveBeenCalled()

    schedulePostRenderBootHydrate({ status: 'timed_out' })
    attempts = 1
    await Promise.resolve()
    await Promise.resolve()

    expect(attempts).toBeGreaterThanOrEqual(1)
    remountSpy.mockRestore()
  })
})

describe('linkedFileAccessUnavailableMessage', () => {
  it('includes generic and Brave hints', () => {
    const msg = linkedFileAccessUnavailableMessage()
    expect(msg).toMatch(/File access unavailable/i)
    expect(msg).toMatch(/Brave/i)
    expect(msg).toMatch(/Re-link file/i)
  })
})