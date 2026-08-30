import { describe, expect, it } from 'vitest'
import { applyLinkedSaveMode, getLinkedSaveMode } from '../../src/lib/linkedSaveMode'

describe('linked save mode', () => {
  it('defaults to edits + periodic before any choice', () => {
    expect(getLinkedSaveMode()).toBe('edits-periodic')
  })

  it('round-trips edits-only and edits + periodic', () => {
    applyLinkedSaveMode('edits')
    expect(getLinkedSaveMode()).toBe('edits')
    applyLinkedSaveMode('edits-periodic')
    expect(getLinkedSaveMode()).toBe('edits-periodic')
  })
})
