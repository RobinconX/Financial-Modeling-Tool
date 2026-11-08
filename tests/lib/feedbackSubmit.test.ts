import { describe, expect, it, vi, afterEach } from 'vitest'
import { buildFeedbackContext, formatFeedbackContextBlock } from '../../src/lib/feedbackContext'
import { submitFeedbackReport } from '../../src/lib/feedbackSubmit'

describe('feedbackSubmit', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('buildFeedbackContext excludes personal fields', () => {
    const ctx = buildFeedbackContext('portfolio', 'Mozilla/5.0 Chrome/120 Windows NT 10.0')
    expect(ctx.tab).toBe('Portfolio')
    expect(formatFeedbackContextBlock(ctx)).not.toMatch(/email|name/i)
    expect(ctx.browser).toBe('Chrome')
    expect(ctx.os).toBe('Windows')
  })

  it('honeypot fill short-circuits as success without fetch', async () => {
    const fetchFn = vi.fn()
    const ctx = buildFeedbackContext('overview', 'TestUA')
    const result = await submitFeedbackReport(
      { type: 'idea', description: 'hello', context: ctx, honeypot: 'spam' },
      fetchFn,
    )
    expect(result.ok).toBe(true)
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('rejects empty description', async () => {
    vi.stubEnv('VITE_FEEDBACK_FORM_ACCESS_KEY', 'test-key')
    const ctx = buildFeedbackContext('settings', 'TestUA')
    const result = await submitFeedbackReport(
      { type: 'bug', description: '  ', context: ctx, honeypot: '' },
      vi.fn(),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.kind).toBe('rejected')
  })

  it('posts to web3forms when configured', async () => {
    vi.stubEnv('VITE_FEEDBACK_FORM_ACCESS_KEY', 'test-key')
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
    const ctx = buildFeedbackContext('projections', 'TestUA')
    const result = await submitFeedbackReport(
      { type: 'bug', description: 'Chart flickers', context: ctx, honeypot: '' },
      fetchFn,
    )
    expect(result.ok).toBe(true)
    expect(fetchFn).toHaveBeenCalledOnce()
    const [, init] = fetchFn.mock.calls[0]!
    const body = JSON.parse(String(init?.body)) as Record<string, string>
    expect(body.access_key).toBe('test-key')
    expect(body.message).toContain('Chart flickers')
    expect(body.message).toContain('Automatic context')
  })
})
