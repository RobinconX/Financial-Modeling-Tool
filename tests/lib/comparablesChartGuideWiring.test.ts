import { describe, expect, it } from 'vitest'
import { getGuide, getParentGuide } from '../../src/lib/teachings'

describe('comparables chart guide wiring', () => {
  it('registers both chart guides under comps with stable teleport anchors', () => {
    for (const id of ['comparables.cagrChart', 'comparables.upsideChart'] as const) {
      const g = getGuide(id)
      expect(g?.status).toBe('ready')
      expect(g?.location).toEqual({
        tab: 'projections',
        view: 'comps',
        anchor: id,
      })
      expect(getParentGuide(id)?.id).toBe('projections.comps')
    }
  })
})
