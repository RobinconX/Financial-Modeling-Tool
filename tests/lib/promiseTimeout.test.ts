import { describe, expect, it, vi } from 'vitest'
import { PromiseTimeoutError, withTimeout } from '../../src/lib/promiseTimeout'

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, 'fast')).resolves.toBe(42)
  })

  it('rejects when the promise never settles', async () => {
    vi.useFakeTimers()
    const hanging = new Promise<number>(() => {})
    const p = withTimeout(hanging, 50, 'hang')
    vi.advanceTimersByTime(50)
    await expect(p).rejects.toBeInstanceOf(PromiseTimeoutError)
    vi.useRealTimers()
  })
})