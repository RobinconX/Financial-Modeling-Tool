import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getLastLinkedFileSaveEvent,
  readLinkedSnapshotForStartup,
  reportLinkedFileStartupHydrateFailure,
  resetLinkedDataFileWriteStateForTests,
} from '../../src/lib/linkedDataFile'
import { createMockFileHandle } from './linkedDataFileWrite.test'

describe('linked file startup hydrate', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'test')
    resetLinkedDataFileWriteStateForTests(null)
  })

  it('readLinkedSnapshotForStartup does not call requestPermission', async () => {
    const requestPermission = vi.fn(async () => 'prompt' as const)
    const handle = {
      ...createMockFileHandle('model.json'),
      queryPermission: async () => 'prompt' as const,
      requestPermission,
    }
    resetLinkedDataFileWriteStateForTests(handle)

    const snap = await readLinkedSnapshotForStartup()
    expect(snap).toEqual({
      error: 'File access needed — open Settings and use Allow file access',
    })
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('readLinkedSnapshotForStartup times out hanging getFile', async () => {
    vi.useFakeTimers()
    const handle = {
      ...createMockFileHandle('model.json'),
      queryPermission: async () => 'granted' as const,
      getFile: () => new Promise<File>(() => {}),
    }
    resetLinkedDataFileWriteStateForTests(handle)

    const snapPromise = readLinkedSnapshotForStartup({ stepTimeoutMs: 80 })
    await vi.advanceTimersByTimeAsync(100)
    const snap = await snapPromise
    expect(snap).toMatchObject({
      error: expect.stringMatching(/File access unavailable/i),
    })
    vi.useRealTimers()
  })

  it('reportLinkedFileStartupHydrateFailure sets load-failed header event', () => {
    const handle = createMockFileHandle('model.json')
    resetLinkedDataFileWriteStateForTests(handle)

    reportLinkedFileStartupHydrateFailure('Invalid catalog in file', 'model.json')

    expect(getLastLinkedFileSaveEvent()).toMatchObject({
      status: 'load-failed',
      message: 'Invalid catalog in file',
      fileName: 'model.json',
    })
  })
})
