/**
 * Optional external API origin for quote/FX when the app is on a static host
 * (GitHub Pages has no /api middleware).
 *
 * Local dev / preview: leave unset → relative `/api/...` (Vite plugin).
 * Pages: set VITE_API_BASE=https://your-worker.workers.dev (no trailing slash).
 */
export function apiUrl(path: string): string {
  const raw = import.meta.env.VITE_API_BASE
  const base =
    typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : ''
  const p = path.startsWith('/') ? path : `/${path}`
  return `${base}${p}`
}

export function hasExternalApiBase(): boolean {
  const raw = import.meta.env.VITE_API_BASE
  return typeof raw === 'string' && raw.trim().length > 0
}
