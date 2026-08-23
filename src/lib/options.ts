import { apiUrl, hasExternalApiBase } from './apiBase'
import type { OptionChain } from '../../server/options'

export type { OptionChain, OptionChainContract } from '../../server/options'

export async function fetchOptionChainClient(
  underlying: string,
  expiration?: string | null,
): Promise<OptionChain> {
  const qs = new URLSearchParams({ symbol: underlying.trim().toUpperCase() })
  if (expiration) qs.set('date', expiration)
  const path = `/api/options?${qs.toString()}`
  let res: Response
  try {
    res = await fetch(apiUrl(path))
  } catch {
    throw new Error(
      hasExternalApiBase()
        ? `Network error fetching options for ${underlying}`
        : `Options need a local dev server or API (set VITE_API_BASE).`,
    )
  }
  const body = (await res.json()) as OptionChain & { error?: string }
  if (!res.ok) {
    throw new Error(body.error ?? `Failed to fetch options for ${underlying}`)
  }
  return body
}
