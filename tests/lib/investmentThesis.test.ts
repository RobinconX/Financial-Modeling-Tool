import { describe, expect, it } from 'vitest'
import { normalizeInvestmentThesis, hasInvestmentThesis } from '../../src/lib/investmentThesis'
import { normalizeScenario } from '../../src/lib/storage'

describe('normalizeInvestmentThesis', () => {
  it('trims and drops blanks', () => {
    expect(normalizeInvestmentThesis('  hi  ')).toBe('hi')
    expect(normalizeInvestmentThesis('   ')).toBeUndefined()
    expect(normalizeInvestmentThesis(undefined)).toBeUndefined()
  })

  it('clips overly long text', () => {
    const long = 'x'.repeat(5000)
    expect(normalizeInvestmentThesis(long)?.length).toBe(4000)
  })
})

describe('hasInvestmentThesis', () => {
  it('detects non-empty thesis', () => {
    expect(hasInvestmentThesis('a')).toBe(true)
    expect(hasInvestmentThesis('  ')).toBe(false)
    expect(hasInvestmentThesis(undefined)).toBe(false)
  })
})

describe('normalizeScenario investmentThesis', () => {
  const base = {
    id: '1',
    symbol: 'AAPL',
    name: 'Base',
    easyRows: [{ id: 'e', year: 2030, projectedMarketCap: 1 }],
    advancedRows: [],
  }

  it('round-trips investmentThesis', () => {
    const raw = { ...base, investmentThesis: '**Bull** case' }
    const sc = normalizeScenario(raw)
    expect(sc?.investmentThesis).toBe('**Bull** case')
  })

  it('omits blank investmentThesis', () => {
    const sc = normalizeScenario({ ...base, investmentThesis: '  ' })
    expect(sc?.investmentThesis).toBeUndefined()
  })
})