import { describe, expect, it } from 'vitest'
import {
  isOptionLifecycleEvent,
  tradeMarkerActionColor,
  tradeMarkerActionLabel,
  tradeMarkerContractLabel,
} from '../../src/lib/tradeMarkerDisplay'

describe('tradeMarkerDisplay', () => {
  it('labels equity sides plainly', () => {
    expect(
      tradeMarkerActionLabel({
        symbol: 'AAPL',
        side: 'buy',
        instrument: 'equity',
      }),
    ).toBe('Buy')
    expect(tradeMarkerActionColor({ symbol: 'AAPL', side: 'sell', instrument: 'equity' })).toBe(
      '#f87171',
    )
  })

  it('labels option opens and lifecycle events', () => {
    const occ = 'HIMS261016P00025000'
    expect(
      tradeMarkerActionLabel({
        symbol: 'HIMS',
        side: 'sell',
        instrument: 'option',
        occSymbol: occ,
        event: 'trade',
      }),
    ).toBe('Sell to open (option)')
    expect(
      tradeMarkerActionLabel({
        symbol: 'HIMS',
        side: 'buy',
        instrument: 'option',
        occSymbol: occ,
        event: 'trade',
      }),
    ).toBe('Buy to close (option)')
    expect(
      tradeMarkerActionLabel({
        symbol: 'HIMS',
        side: 'sell',
        instrument: 'option',
        occSymbol: occ,
        event: 'expire',
      }),
    ).toBe('Expired')
    expect(
      tradeMarkerActionLabel({
        symbol: 'HIMS',
        side: 'sell',
        instrument: 'option',
        occSymbol: occ,
        event: 'assign',
      }),
    ).toBe('Assigned')
    expect(
      tradeMarkerActionLabel({
        symbol: 'HIMS',
        side: 'buy',
        instrument: 'option',
        occSymbol: occ,
        event: 'exercise',
      }),
    ).toBe('Exercised')
    expect(isOptionLifecycleEvent('option', 'expire')).toBe(true)
    expect(isOptionLifecycleEvent('option', 'trade')).toBe(false)
  })

  it('formats OCC symbols for display', () => {
    const label = tradeMarkerContractLabel({
      symbol: 'PLTR',
      side: 'sell',
      instrument: 'option',
      occSymbol: 'PLTR240919C00047000',
    })
    expect(label).toContain('PLTR')
    expect(label).toMatch(/47C/)
  })
})