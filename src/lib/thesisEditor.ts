import { INVESTMENT_THESIS_MAX_LENGTH } from './investmentThesis'

/** Live thesis edits: allow shrink/replace at cap; block net growth past limit. */
export function canAcceptThesisMarkdown(prev: string, next: string): boolean {
  if (next.length <= INVESTMENT_THESIS_MAX_LENGTH) return true
  return next.length < prev.length
}

export function thesisMarkdownLength(md: string): number {
  return md.length
}