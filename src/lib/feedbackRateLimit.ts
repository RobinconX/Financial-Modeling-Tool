const LAST_KEY = 'fmt-feedback-last-sent'
const DAY_KEY = 'fmt-feedback-day'
const COUNT_KEY = 'fmt-feedback-daily-count'

export const FEEDBACK_COOLDOWN_MS = 60_000
export const FEEDBACK_DAILY_MAX = 10

export type FeedbackRateStatus =
  | { allowed: true }
  | { allowed: false; reason: 'cooldown'; waitMs: number }
  | { allowed: false; reason: 'daily'; resetsTomorrow: true }

function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function readFeedbackRateStatus(
  now = Date.now(),
  storage: Pick<Storage, 'getItem'> = localStorage,
): FeedbackRateStatus {
  const lastRaw = storage.getItem(LAST_KEY)
  const last = lastRaw ? Number(lastRaw) : 0
  if (last > 0 && now - last < FEEDBACK_COOLDOWN_MS) {
    return { allowed: false, reason: 'cooldown', waitMs: FEEDBACK_COOLDOWN_MS - (now - last) }
  }

  const day = storage.getItem(DAY_KEY)
  const countRaw = storage.getItem(COUNT_KEY)
  const count = countRaw ? Number(countRaw) : 0
  const today = todayKey()
  if (day === today && count >= FEEDBACK_DAILY_MAX) {
    return { allowed: false, reason: 'daily', resetsTomorrow: true }
  }
  return { allowed: true }
}

export function recordFeedbackSent(
  now = Date.now(),
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
): void {
  storage.setItem(LAST_KEY, String(now))
  const today = todayKey()
  const day = storage.getItem(DAY_KEY)
  const countRaw = storage.getItem(COUNT_KEY)
  let count = countRaw ? Number(countRaw) : 0
  if (day !== today) {
    count = 0
    storage.setItem(DAY_KEY, today)
  }
  storage.setItem(COUNT_KEY, String(count + 1))
}

export function formatCooldownWait(ms: number): string {
  const sec = Math.max(1, Math.ceil(ms / 1000))
  return sec === 1 ? '1 second' : `${sec} seconds`
}
