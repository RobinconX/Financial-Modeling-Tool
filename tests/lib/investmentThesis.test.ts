import { describe, expect, it } from 'vitest'
import {
  clipInvestmentThesis,
  normalizeInvestmentThesis,
  hasInvestmentThesis,
  INVESTMENT_THESIS_MAX_LENGTH,
} from '../../src/lib/investmentThesis'
import { normalizeScenario } from '../../src/lib/storage'

describe('normalizeInvestmentThesis', () => {
  it('trims and drops blanks', () => {
    expect(normalizeInvestmentThesis('  hi  ')).toBe('hi')
    expect(normalizeInvestmentThesis('   ')).toBeUndefined()
    expect(normalizeInvestmentThesis(undefined)).toBeUndefined()
  })

  it('keeps internal newlines when trimming save text', () => {
    expect(normalizeInvestmentThesis('line one\nline two')).toBe('line one\nline two')
    expect(normalizeInvestmentThesis('  line one\n\nline two  ')).toBe('line one\n\nline two')
  })

  it('clips overly long text', () => {
    const long = 'x'.repeat(5000)
    expect(normalizeInvestmentThesis(long)?.length).toBe(4000)
  })
})

describe('clipInvestmentThesis', () => {
  it('passes through under the cap', () => {
    expect(clipInvestmentThesis('hello')).toBe('hello')
  })

  it('clips at the max length', () => {
    const long = 'y'.repeat(INVESTMENT_THESIS_MAX_LENGTH + 1)
    expect(clipInvestmentThesis(long).length).toBe(INVESTMENT_THESIS_MAX_LENGTH)
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