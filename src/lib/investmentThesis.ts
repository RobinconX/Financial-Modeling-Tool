/** Max stored length for scenario investment thesis (plain text + light markdown). */
export const INVESTMENT_THESIS_MAX_LENGTH = 4000

export function normalizeInvestmentThesis(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  if (trimmed.length <= INVESTMENT_THESIS_MAX_LENGTH) return trimmed
  return trimmed.slice(0, INVESTMENT_THESIS_MAX_LENGTH)
}

export function hasInvestmentThesis(thesis: string | undefined | null): boolean {
  return Boolean(thesis?.trim())
}