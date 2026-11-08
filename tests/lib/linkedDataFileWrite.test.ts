import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  getLastLinkedFileSaveEvent,
  notifyAppDataChanged,
  resetLinkedDataFileWriteStateForTests,
  scheduleLinkedFileWrite,
  unlinkDataFile,
  writeLinkedSnapshot,
} from '../../src/lib/linkedDataFile'

type MockWritable = {
  write: (data: string) => Promise<void>
  close: () => Promise<void>
}

type MockHandleOptions = {
  failOnWriteNumber?: number
  writableDelayMs?: number
}

export function createMockFileHandle(
  name = 'fmt-data.json',
  options: MockHandleOptions = {},
) {
  const bodies: string[] = []
  let concurrentWritable = 0
  let maxConcurrentWritable = 0
  let writeCount = 0
  let createWritableCall = 0
  const createWritableResolvers: Array<() => void> = []
  let gate: Promise<void> = Promise.resolve()
  let releaseGate: (() => void) | null = null

  const holdNextCreateWritable = () => {
    gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
  }

  const releaseCreateWritable = () => {
    releaseGate?.()
    releaseGate = null
    gate = Promise.resolve()
  }

  const handle = {
    name,
    queryPermission: async () => 'granted' as const,
    requestPermission: async () => 'granted' as const,
    getFile: async () => new File(['{}'], name, { type: 'application/json' }),
    createWritable: async (): Promise<MockWritable> => {
      createWritableCall += 1
      await gate
      concurrentWritable += 1
      maxConcurrentWritable = Math.max(maxConcurrentWritable, concurrentWritable)
      const thisWrite = createWritableCall
      return {
        write: async (data: string) => {
          writeCount += 1
          if (
            options.failOnWriteNumber !== undefined &&
            writeCount === options.failOnWriteNumber
          ) {
            throw new Error('mock write failure')
          }
          if (options.writableDelayMs) {
            await new Promise((r) => setTimeout(r, options.writableDelayMs))
          }
          bodies.push(data)
          void thisWrite
        },
        close: async () => {
          concurrentWritable -= 1
          const resolver = createWritableResolvers.shift()
          resolver?.()
        },
      }
    },
    getWriteBodies: () => [...bodies],
    getMaxConcurrentWritable: () => maxConcurrentWritable,
    getWriteCount: () => writeCount,
    getCreateWritableCalls: () => createWritableCall,
    holdNextCreateWritable,
    releaseCreateWritable,
  }

  return handle
}

describe('linked data file write path', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(async () => {
    await vi.runOnlyPendingTimersAsync()
    vi.useRealTimers()
    resetLinkedDataFileWriteStateForTests(null)
  })

  it('coalesces rapid edits into one debounced write', async () => {
    const handle = createMockFileHandle()
    resetLinkedDataFileWriteStateForTests(handle)

    scheduleLinkedFileWrite(50)
    scheduleLinkedFileWrite(50)
    notifyAppDataChanged()
    scheduleLinkedFileWrite(50)

    await vi.advanceTimersByTimeAsync(49)
    expect(handle.getWriteCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(10)
    await vi.runAllTimersAsync()

    expect(handle.getWriteCount()).toBe(1)
    expect(getLastLinkedFileSaveEvent().status).toBe('saved')
  })

  it('serializes writes so createWritable never overlaps and order is preserved', async () => {
    const handle = createMockFileHandle()
    resetLinkedDataFileWriteStateForTests(handle)

    const first = writeLinkedSnapshot({ pass: 1 })
    const second = writeLinkedSnapshot({ pass: 2 })
    const third = writeLinkedSnapshot({ pass: 3 })

    await Promise.all([first, second, third])

    expect(handle.getMaxConcurrentWritable()).toBe(1)
    expect(handle.getWriteCount()).toBe(3)
    const payloads = handle.getWriteBodies().map((b) => JSON.parse(b) as { pass: number })
    expect(payloads.map((p) => p.pass)).toEqual([1, 2, 3])
  })

  it('flushes a write queued while a flush is in flight', async () => {
    const handle = createMockFileHandle()
    resetLinkedDataFileWriteStateForTests(handle)
    handle.holdNextCreateWritable()

    scheduleLinkedFileWrite(0)
    await vi.runAllTimersAsync()

    expect(getLastLinkedFileSaveEvent().status).toBe('saving')

    scheduleLinkedFileWrite(100)
    handle.releaseCreateWritable()
    await vi.runAllTimersAsync()

    expect(handle.getWriteCount()).toBe(2)
    expect(getLastLinkedFileSaveEvent().status).toBe('saved')
  })

  it('does not drop later data when an earlier write fails', async () => {
    const handle = createMockFileHandle('fmt-data.json', { failOnWriteNumber: 1 })
    resetLinkedDataFileWriteStateForTests(handle)

    const failed = await writeLinkedSnapshot({ attempt: 1 })
    expect(failed).toEqual({ ok: false, error: 'mock write failure' })

    const ok = await writeLinkedSnapshot({ attempt: 2 })
    expect(ok.ok).toBe(true)
    expect(handle.getWriteCount()).toBe(2)
    expect(JSON.parse(handle.getWriteBodies().at(-1) ?? '{}')).toEqual({ attempt: 2 })
    expect(getLastLinkedFileSaveEvent().status).toBe('saved')
  })

  it('cancels pending debounce and tolerates unlink during an in-flight write', async () => {
    const handle = createMockFileHandle('fmt-data.json', { writableDelayMs: 50 })
    resetLinkedDataFileWriteStateForTests(handle)

    handle.holdNextCreateWritable()
    const inFlight = writeLinkedSnapshot({ during: 'unlink' })
    await vi.waitFor(() => {
      expect(handle.getCreateWritableCalls()).toBe(1)
    })

    scheduleLinkedFileWrite(1000)
    await Promise.resolve()
    expect(getLastLinkedFileSaveEvent().status).toBe('pending')

    await unlinkDataFile()
    expect(getLastLinkedFileSaveEvent()).toMatchObject({
      status: 'idle',
      message: 'No linked file',
      fileName: null,
    })

    handle.releaseCreateWritable()
    await vi.advanceTimersByTimeAsync(50)
    const result = await inFlight
    expect(result).toEqual({ ok: true })
    expect(handle.getWriteCount()).toBe(1)

    scheduleLinkedFileWrite(10)
    await vi.advanceTimersByTimeAsync(20)
    expect(handle.getWriteCount()).toBe(1)
  })
})
