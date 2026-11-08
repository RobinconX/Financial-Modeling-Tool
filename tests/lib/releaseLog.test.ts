import { describe, expect, it } from 'vitest'
import {
  listReleaseLogEntries,
  shortSha,
  validateReleaseLogForProd,
  type ReleaseLogEntry,
} from '../../src/lib/releaseLog'

describe('releaseLog', () => {
  it('lists merged-PR history newest-first', () => {
    const entries = listReleaseLogEntries()
    expect(entries.length).toBe(19)
    expect(entries[0]?.pending).toBe(true)
    expect(entries[1]?.prodSha).toBe('b99d3c3')
    expect(entries.at(-1)?.headline).toMatch(/Budget/i)
  })

  it('shortSha trims long shas', () => {
    expect(shortSha('abcdef1234567890')).toBe('abcdef1')
    expect(shortSha(null)).toBe('—')
  })

  it('validateReleaseLogForProd accepts matching newest entry', () => {
    const log: ReleaseLogEntry[] = [
      {
        releasedAt: '2026-11-08',
        prodSha: 'abc1234def567',
        headline: 'Test',
        notes: ['Note'],
      },
    ]
    expect(validateReleaseLogForProd(log, 'abc1234def567')).toEqual({ ok: true })
    expect(validateReleaseLogForProd(log, 'abc1234')).toEqual({ ok: true })
  })

  it('validateReleaseLogForProd rejects pending or missing sha', () => {
    const pending: ReleaseLogEntry[] = [
      {
        releasedAt: '2026-11-08',
        prodSha: null,
        pending: true,
        headline: 'Upcoming',
        notes: ['x'],
      },
    ]
    const r1 = validateReleaseLogForProd(pending, 'abc1234')
    expect(r1.ok).toBe(false)
    if (!r1.ok) expect(r1.message).toMatch(/pending/i)
  })

  const ciEnv = (
    globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }
  ).process?.env

  it.runIf(ciEnv?.RELEASE_LOG_PROD_BUILD === '1')('passes prod gate for current deploy SHA', () => {
      const sha = ciEnv?.GITHUB_SHA?.trim()
      const parentSha = ciEnv?.RELEASE_LOG_PARENT_SHA?.trim()
      expect(sha, 'GITHUB_SHA required for prod release log check').toBeTruthy()
      const result = validateReleaseLogForProd(
        listReleaseLogEntries(),
        sha!,
        parentSha ? { parentSha } : undefined,
      )
      expect(result.ok, !result.ok ? result.message : undefined).toBe(true)
    },
  )

  it('validateReleaseLogForProd accepts prodSha on deploy parent (release-log finalize)', () => {
    const log: ReleaseLogEntry[] = [
      {
        releasedAt: '2026-11-08',
        prodSha: 'b0c7c89',
        headline: 'Feature',
        notes: ['Note'],
      },
    ]
    expect(validateReleaseLogForProd(log, 'fffffffffff', { parentSha: 'b0c7c89d3de6' })).toEqual({
      ok: true,
    })
  })
})
