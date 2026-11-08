import entries from '../data/release-log.json'

export type ReleaseLogEntry = {
  releasedAt: string
  prodSha: string | null
  /** When true, entry is staged on DEV and must be finalized before a v1-prod deploy. */
  pending?: boolean
  headline: string
  notes: string[]
}

const RELEASE_LOG = entries as ReleaseLogEntry[]

export function listReleaseLogEntries(): readonly ReleaseLogEntry[] {
  return RELEASE_LOG
}

export function shortSha(sha: string | null | undefined): string {
  if (!sha) return '—'
  const s = sha.trim()
  if (s.length <= 12) return s
  return s.slice(0, 7)
}

function shaMatches(entrySha: string, deploySha: string): boolean {
  const a = entrySha.trim().toLowerCase()
  const b = deploySha.trim().toLowerCase()
  if (!a || !b) return false
  if (a === b) return true
  if (a.length >= 7 && b.length >= 7 && a.slice(0, 7) === b.slice(0, 7)) return true
  return false
}

/**
 * Called from CI on v1-prod Pages builds. Newest entry must match the commit being deployed
 * and must not still be marked pending.
 */
export function validateReleaseLogForProd(
  log: readonly ReleaseLogEntry[],
  deploySha: string,
  options?: { parentSha?: string; ancestorShas?: readonly string[] },
): { ok: true } | { ok: false; message: string } {
  const sha = deploySha.trim()
  if (!sha) {
    return { ok: false, message: 'Missing deploy SHA for release log check.' }
  }
  const parentSha = options?.parentSha?.trim() ?? ''
  const ancestorShas =
    options?.ancestorShas?.map((s) => s.trim()).filter((s) => s.length > 0) ?? []
  if (log.length === 0) {
    return { ok: false, message: 'Release log is empty — add an entry before deploying.' }
  }
  const newest = log[0]!
  if (newest.pending) {
    return {
      ok: false,
      message:
        'Newest release log entry is still pending — set prodSha to this deploy commit and clear pending (see .cursor/rules/ship-it.mdc).',
    }
  }
  if (!newest.prodSha) {
    return {
      ok: false,
      message: 'Newest release log entry is missing prodSha — record the v1-prod merge commit before deploy.',
    }
  }
  const deployRefs = [sha]
  if (parentSha) deployRefs.push(parentSha)
  for (const a of ancestorShas) {
    if (!deployRefs.includes(a)) deployRefs.push(a)
  }
  if (!deployRefs.some((ref) => shaMatches(newest.prodSha, ref))) {
    return {
      ok: false,
      message: `Newest release log prodSha (${newest.prodSha}) does not match deploy SHA (${sha}) or its recent ancestors.`,
    }
  }
  return { ok: true }
}
