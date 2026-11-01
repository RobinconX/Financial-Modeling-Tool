/**
 * Resolve a root-relative public asset for the current Vite base
 * (e.g. `/guides/x.jpg` → `/Financial-Modeling-Tool/guides/x.jpg` on project Pages).
 * Absolute http(s) / data URLs are returned unchanged for CDN/API figures.
 */
export function publicAssetUrl(src: string): string {
  const t = src.trim()
  if (!t) return t
  if (/^(https?:|data:|blob:)/i.test(t)) return t
  const base = import.meta.env.BASE_URL || '/'
  const path = t.replace(/^\/+/, '')
  return `${base}${path}`
}
