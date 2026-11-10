export const CORRUPT_BACKUP_PREFIX = 'grok-lab.corrupt-backup:'

export type StorageRecoveryReason = 'parse' | 'shape' | 'content'

export type StorageRecoveryNotice = {
  storageKey: string
  label: string
  reason: StorageRecoveryReason
  backupKey: string
}

export type StorageLoadResult<T> = {
  data: T
  recovery: StorageRecoveryNotice | null
}

export function corruptBackupKey(storageKey: string): string {
  return `${CORRUPT_BACKUP_PREFIX}${storageKey}`
}

/** Keep raw corrupt bytes in a side key so the next save does not destroy them. */
export function archiveCorruptStorage(storageKey: string, raw: string): string {
  const backupKey = corruptBackupKey(storageKey)
  try {
    localStorage.setItem(backupKey, raw)
  } catch (err) {
    console.warn('[storageLoadRecovery] Failed to archive corrupt data', err)
  }
  return backupKey
}

export function buildRecoveryNotice(
  storageKey: string,
  label: string,
  reason: StorageRecoveryReason,
  raw: string,
): StorageRecoveryNotice {
  const backupKey = archiveCorruptStorage(storageKey, raw)
  return { storageKey, label, reason, backupKey }
}

export function recoveryUserMessage(notice: StorageRecoveryNotice): string {
  const reasonText =
    notice.reason === 'parse'
      ? 'could not be parsed as JSON'
      : notice.reason === 'shape'
        ? 'has an unexpected shape'
        : 'could not be read'
  return `${notice.label} data in browser storage ${reasonText}. The app started with empty ${notice.label.toLowerCase()} data for this session.`
}

export function downloadCorruptBackup(notice: StorageRecoveryNotice): void {
  try {
    const raw = localStorage.getItem(notice.backupKey)
    if (!raw) return
    const slug = notice.label.toLowerCase().replace(/\s+/g, '-')
    const name = `corrupt-${slug}-backup-${new Date().toISOString().slice(0, 10)}.json`
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2_000)
  } catch (err) {
    console.warn('[storageLoadRecovery] Download failed', err)
  }
}
