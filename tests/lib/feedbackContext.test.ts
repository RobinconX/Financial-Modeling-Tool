import { describe, expect, it } from 'vitest'
import { feedbackEmailSubject } from '../../src/lib/feedbackContext'

describe('feedbackEmailSubject', () => {
  it('maps feedback types to email subjects', () => {
    expect(feedbackEmailSubject('bug')).toBe('[FMT] Bug report')
    expect(feedbackEmailSubject('idea')).toBe('[FMT] Feature idea')
    expect(feedbackEmailSubject('question')).toBe('[FMT] Question')
  })
})
