import { describe, expect, it } from 'vitest'
import { parseClipboardGrid } from '../../src/lib/sheetGrid'

describe('parseClipboardGrid', () => {
  it('splits Excel TSV into rows and columns', () => {
    expect(parseClipboardGrid('10\t20\n30\t40\n')).toEqual([
      ['10', '20'],
      ['30', '40'],
    ])
  })

  it('treats a single column of lines as rows', () => {
    expect(parseClipboardGrid('100\n200\n300')).toEqual([['100'], ['200'], ['300']])
  })

  it('returns empty for blank clipboard', () => {
    expect(parseClipboardGrid('')).toEqual([])
    expect(parseClipboardGrid('\n')).toEqual([])
  })
})
