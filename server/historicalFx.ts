type FrankfurterResponse = {
  date?: string
  rates?: Record<string, number>
}

/** ECB daily USD/CHF from Frankfurter (https://api.frankfurter.app). */
export async function fetchFrankfurterUsdChfOnDate(
  isoDate: string,
): Promise<{ rate: number; rateDate: string } | null> {
  const date = isoDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const url = `https://api.frankfurter.app/${encodeURIComponent(date)}?from=USD&to=CHF`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = (await res.json()) as FrankfurterResponse
    const rate = data.rates?.CHF
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return null
    return { rate, rateDate: data.date ?? date }
  } catch {
    return null
  }
}