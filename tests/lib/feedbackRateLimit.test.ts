import { describe, expect, it } from 'vitest'
import {
  FEEDBACK_COOLDOWN_MS,
  FEEDBACK_DAILY_MAX,
  formatCooldownWait,
  readFeedbackRateStatus,
  recordFeedbackSent,
} from '../../src/lib/feedbackRateLimit'

describe('feedbackRateLimit', () => {
  it('allows first send', () => {
    const storage = new Map<string, string>()
    const mock = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v)
      },
    }
    expect(readFeedbackRateStatus(0, mock).allowed).toBe(true)
  })

  it('blocks during cooldown', () => {
    const storage = new Map<string, string>()
    const mock = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v)
      },
    }
    recordFeedbackSent(1000, mock)
    const status = readFeedbackRateStatus(1000 + FEEDBACK_COOLDOWN_MS - 1, mock)
    expect(status.allowed).toBe(false)
    if (!status.allowed && status.reason === 'cooldown') {
      expect(status.waitMs).toBeGreaterThan(0)
    }
  })

  it('blocks after daily max', () => {
    const storage = new Map<string, string>()
    const mock = {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v)
      },
    }
    const base = 1_700_000_000_000
    for (let i = 0; i < FEEDBACK_DAILY_MAX; i++) {
      recordFeedbackSent(base + i * (FEEDBACK_COOLDOWN_MS + 1), mock)
    }
    const status = readFeedbackRateStatus(base + FEEDBACK_DAILY_MAX * (FEEDBACK_COOLDOWN_MS + 10), mock)
    expect(status.allowed).toBe(false)
    if (!status.allowed) expect(status.reason).toBe('daily')
  })

  it('formatCooldownWait rounds up seconds', () => {
    expect(formatCooldownWait(500)).toBe('1 second')
    expect(formatCooldownWait(2500)).toBe('3 seconds')
  })
})
