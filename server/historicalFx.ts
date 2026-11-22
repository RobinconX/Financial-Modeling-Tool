type FrankfurterDayResponse = {
  date?: string
  rates?: Record<string, number>
}

type FrankfurterRangeResponse = {
  rates?: Record<string, Record<string, number>>
}

const FRANKFURTER_V1 = 'https://api.frankfurter.dev/v1'

/** Single-day USD/CHF (legacy / tests only — prefer range fetch). */
export async function fetchFrankfurterUsdChfOnDate(
  isoDate: string,
): Promise<{ rate: number; rateDate: string } | null> {
  const date = isoDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const url = `${FRANKFURTER_V1}/${encodeURIComponent(date)}?base=USD&symbols=CHF`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = (await res.json()) as FrankfurterDayResponse
    const rate = data.rates?.CHF
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return null
    return { rate, rateDate: data.date ?? date }
  } catch {
    return null
  }
}

/** Inclusive date range of ECB daily USD/CHF rates. */
export async function fetchFrankfurterUsdChfRange(
  startDate: string,
  endDate: string,
): Promise<Record<string, number> | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return null
  }
  if (startDate > endDate) return null
  const url = `${FRANKFURTER_V1}/${encodeURIComponent(startDate)}..${encodeURIComponent(endDate)}?base=USD&symbols=CHF`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = (await res.json()) as FrankfurterRangeResponse
    const raw = data.rates
    if (!raw || typeof raw !== 'object') return null
    const out: Record<string, number> = {}
    for (const [d, row] of Object.entries(raw)) {
      const rate = row?.CHF
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && rate != null && Number.isFinite(rate) && rate > 0) {
        out[d] = rate
      }
    }
    return Object.keys(out).length > 0 ? out : null
  } catch {
    return null
  }
}