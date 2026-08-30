import { describe, expect, it } from 'vitest'
import { getLinkedSaveMode, setLinkedSaveMode } from '../../src/lib/linkedDataFile'

describe('linked save mode', () => {
  it('defaults to edits + periodic before any choice', () => {
    expect(getLinkedSaveMode()).toBe('edits-periodic')
  })

  it('round-trips edits-only and edits + periodic', () => {
    setLinkedSaveMode('edits')
    expect(getLinkedSaveMode()).toBe('edits')
    setLinkedSaveMode('edits-periodic')
    expect(getLinkedSaveMode()).toBe('edits-periodic')
  })
})
