import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LINKED_FILE_RELINK_PROMPT_ERROR,
  requestLinkedFileAccess,
  resetLinkedDataFileWriteStateForTests,
  startLinkedFilePermissionRequest,
} from '../../src/lib/linkedDataFile'
import { createMockFileHandle } from './linkedDataFileWrite.test'

describe('Allow file access (user gesture)', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'test')
    resetLinkedDataFileWriteStateForTests(null)
  })

  it('startLinkedFilePermissionRequest calls requestPermission synchronously', async () => {
    const events: string[] = []
    const requestPermission = vi.fn(() => {
      events.push('request')
      return Promise.resolve('granted' as const)
    })
    const queryPermission = vi.fn(async () => {
      events.push('query')
      return 'prompt' as const
    })
    const handle = {
      ...createMockFileHandle('model.json'),
      queryPermission,
      requestPermission,
    }
    resetLinkedDataFileWriteStateForTests(handle)

    const started = startLinkedFilePermissionRequest()
    expect(started.ok).toBe(true)
    expect(events).toEqual(['request'])
    expect(queryPermission).not.toHaveBeenCalled()

    if (!started.ok) throw new Error('expected gesture start')
    const result = await requestLinkedFileAccess({ reloadFromFile: false }, started)
    expect(result.ok).toBe(true)
    expect(requestPermission).toHaveBeenCalledTimes(1)
    expect(queryPermission).not.toHaveBeenCalled()
  })

  it('requestPermission runs before a hanging queryPermission would run', async () => {
    const events: string[] = []
    const handle = {
      ...createMockFileHandle('model.json'),
      queryPermission: async () => {
        events.push('query')
        await new Promise<PermissionState>(() => {})
        return 'prompt' as const
      },
      requestPermission: vi.fn(async () => {
        events.push('request')
        return 'granted' as const
      }),
    }
    resetLinkedDataFileWriteStateForTests(handle)

    const started = startLinkedFilePermissionRequest()
    if (!started.ok) throw new Error('expected gesture start')
    const result = await requestLinkedFileAccess({ reloadFromFile: false }, started)
    expect(result.ok).toBe(true)
    expect(events).toEqual(['request'])
  })

  it('returns relink prompt when request is not granted', async () => {
    const handle = {
      ...createMockFileHandle('model.json'),
      queryPermission: async () => 'denied' as const,
      requestPermission: vi.fn(async () => 'denied' as const),
    }
    resetLinkedDataFileWriteStateForTests(handle)

    const started = startLinkedFilePermissionRequest()
    if (!started.ok) throw new Error('expected gesture start')
    const result = await requestLinkedFileAccess({ reloadFromFile: false }, started)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toBe(LINKED_FILE_RELINK_PROMPT_ERROR)
    expect(result.suggestRelink).toBe(true)
  })

  it('times out hanging getFile after grant with OneDrive hint', async () => {
    vi.useFakeTimers()
    const handle = {
      ...createMockFileHandle('COPY-financial-model-prod.json'),
      queryPermission: async () => 'granted' as const,
      requestPermission: vi.fn(async () => 'granted' as const),
      getFile: () => new Promise<File>(() => {}),
    }
    resetLinkedDataFileWriteStateForTests(handle)

    const started = startLinkedFilePermissionRequest()
    if (!started.ok) throw new Error('expected gesture start')
    const resultP = requestLinkedFileAccess(
      { reloadFromFile: true, readTimeoutMs: 100 },
      started,
    )
    await vi.advanceTimersByTimeAsync(150)
    const result = await resultP
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected failure')
    expect(result.error).toMatch(/OneDrive/i)
    expect(result.suggestRelink).toBe(true)
    vi.useRealTimers()
  })

  it('fails fast when handle is not cached for synchronous start', () => {
    const started = startLinkedFilePermissionRequest()
    expect(started.ok).toBe(false)
    if (started.ok) throw new Error('expected failure')
    expect(started.suggestRelink).toBe(true)
    expect(started.error).toBe(LINKED_FILE_RELINK_PROMPT_ERROR)
  })
})