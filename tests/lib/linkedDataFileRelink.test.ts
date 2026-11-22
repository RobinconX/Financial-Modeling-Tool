/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  linkDataFile,
  relinkLinkedDataFile,
  resetLinkedDataFileWriteStateForTests,
} from '../../src/lib/linkedDataFile'
import { createMockFileHandle } from './linkedDataFileWrite.test'

describe('relink linked data file', () => {
  beforeEach(() => {
    vi.stubEnv('MODE', 'test')
    resetLinkedDataFileWriteStateForTests(null)
  })

  it('relink passes startIn from cached handle to showOpenFilePicker', async () => {
    const handle = createMockFileHandle('COPY-financial-model-prod.json')
    resetLinkedDataFileWriteStateForTests(handle)

    const pickerOpts: unknown[] = []
    const w = window as Window & {
      showOpenFilePicker?: (opts: unknown) => Promise<typeof handle[]>
      showSaveFilePicker?: () => Promise<never>
    }
    w.showOpenFilePicker = vi.fn(async (opts) => {
      pickerOpts.push(opts)
      return [handle]
    })
    w.showSaveFilePicker = vi.fn(async () => {
      throw new Error('save picker should not run')
    })

    await relinkLinkedDataFile()
    expect(w.showOpenFilePicker).toHaveBeenCalled()
    expect(pickerOpts[0]).toMatchObject({ startIn: handle })
  })

  it('link without relink does not require startIn', async () => {
    const handle = createMockFileHandle('fresh.json')
    resetLinkedDataFileWriteStateForTests(null)

    const pickerOpts: unknown[] = []
    const w = window as Window & {
      showOpenFilePicker?: (opts: unknown) => Promise<typeof handle[]>
    }
    w.showOpenFilePicker = vi.fn(async (opts) => {
      pickerOpts.push(opts)
      return [handle]
    })

    await linkDataFile({ startFromCachedHandle: false })
    expect(pickerOpts[0]).not.toHaveProperty('startIn')
  })
})