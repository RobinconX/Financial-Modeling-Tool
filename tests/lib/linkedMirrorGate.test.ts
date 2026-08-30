import { describe, expect, it } from 'vitest'
import {
  isLinkedMirrorSuppressed,
  queueAppDataChanged,
  withLinkedMirrorSuppressed,
} from '../../src/lib/linkedMirrorGate'
import { saveScenarios } from '../../src/lib/storage'
import { getLastLinkedFileSaveEvent } from '../../src/lib/linkedDataFile'

describe('linked mirror gate', () => {
  it('does not queue a linked-file save while hydrate is suppressed', async () => {
    withLinkedMirrorSuppressed(() => {
      expect(isLinkedMirrorSuppressed()).toBe(true)
      queueAppDataChanged()
      saveScenarios([])
    })
    expect(isLinkedMirrorSuppressed()).toBe(false)
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 20))
    expect(getLastLinkedFileSaveEvent().status).toBe('idle')
  })
})
