import { describe, expect, it } from 'vitest'
import { applyMarkdownEdit } from '../../src/lib/markdownEdit'

describe('applyMarkdownEdit', () => {
  it('wraps selection in bold', () => {
    const { next, selectionStart, selectionEnd } = applyMarkdownEdit('buy NVDA', 4, 8, 'bold')
    expect(next).toBe('buy **NVDA**')
    expect(next.slice(selectionStart, selectionEnd)).toBe('NVDA')
  })

  it('prefixes heading on line', () => {
    const value = 'Story\nline two'
    const { next } = applyMarkdownEdit(value, 0, 5, 'heading')
    expect(next.startsWith('## Story')).toBe(true)
  })
})