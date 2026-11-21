import { describe, expect, it } from 'vitest'
import { canAcceptThesisMarkdown } from '../../src/lib/thesisEditor'

describe('canAcceptThesisMarkdown', () => {
  it('allows growth under the cap', () => {
    expect(canAcceptThesisMarkdown('a', 'ab')).toBe(true)
  })

  it('blocks net growth past the cap', () => {
    const prev = 'x'.repeat(4000)
    const next = prev + 'y'
    expect(canAcceptThesisMarkdown(prev, next)).toBe(false)
  })

  it('allows shrink at the cap', () => {
    const prev = 'x'.repeat(4000)
    const next = prev.slice(0, -1)
    expect(canAcceptThesisMarkdown(prev, next)).toBe(true)
  })

  it('allows replace at the cap when length unchanged', () => {
    const prev = 'a'.repeat(4000)
    const next = `b${prev.slice(1)}`
    expect(canAcceptThesisMarkdown(prev, next)).toBe(true)
  })
})