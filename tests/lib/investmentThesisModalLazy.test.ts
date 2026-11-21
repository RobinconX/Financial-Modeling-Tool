import { describe, expect, it } from 'vitest'
import {
  loadInvestmentThesisModalModule,
  preloadInvestmentThesisModal,
} from '../../src/components/projections/investmentThesisModalLazy'

describe('investmentThesisModalLazy', () => {
  it('reuses the same import promise across preload and load', () => {
    preloadInvestmentThesisModal()
    const a = loadInvestmentThesisModalModule()
    const b = loadInvestmentThesisModalModule()
    expect(a).toBe(b)
  })
})