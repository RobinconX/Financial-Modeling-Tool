import { describe, expect, it } from 'vitest'
import {
  cagrThresholdHints,
  parseCagrThresholds,
  withYearThreshold,
} from '../../src/lib/cagrThresholds'

describe('cagr thresholds', () => {
  it('keeps only finite year drafts', () => {
    expect(
      parseCagrThresholds({
        '2028': { buy: '15', low: '' },
        '2030': { buy: '', low: '4' },
        nope: { buy: '1', low: '1' },
        '2029': { buy: '  ', low: '' },
        '2031': { buy: 15, low: 4 },
      }),
    ).toEqual({
      '2028': { buy: '15', low: '' },
      '2030': { buy: '', low: '4' },
    })
  })

  it('drops a year once both fields are blank', () => {
    const set = withYearThreshold({}, 2028, { buy: '12' })
    expect(set['2028']).toEqual({ buy: '12', low: '' })
    expect(withYearThreshold(set, 2028, { buy: '  ' })).toEqual({})
  })

  it('hints only strictly above buy and strictly below low', () => {
    const raw = { buy: '15', low: '5' }
    expect(cagrThresholdHints(0.15, raw)).toEqual([])
    expect(cagrThresholdHints(0.05, raw)).toEqual([])
    expect(cagrThresholdHints(0.1501, raw)).toEqual(['buy'])
    expect(cagrThresholdHints(0.0499, raw)).toEqual(['low'])
    expect(cagrThresholdHints(null, raw)).toEqual([])
    expect(cagrThresholdHints(0.2, { buy: 'abc', low: '' })).toEqual([])
  })

  it('can show both hints when the cutoffs are crossed', () => {
    expect(cagrThresholdHints(0.1, { buy: '5', low: '20' })).toEqual(['buy', 'low'])
  })
})
