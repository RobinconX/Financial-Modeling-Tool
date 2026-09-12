/** Extra cash → how much sooner is the goal? Pure solver; no future deposits. */

export const GOAL_SPEED_MAX_YEARS = 80

const MONTH_DAYS = 365.25 / 12
const YEAR_MS = 365.25 * 86_400_000
const EXTRA_TIE = 1e-4

export type GoalSpeedDuration = {
  years: number
  months: number
  totalMonths: number
}

export type GoalSpeedPoint = {
  date: string
  t: number
  wealth: number
  isHit?: boolean
}

export type GoalSpeedHit =
  | {
      reached: true
      already: boolean
      date: string
      t: number
      wealth: number
      duration: GoalSpeedDuration
      yearsFromToday: number
    }
  | { reached: false }

export type GoalSpeedPathResult = {
  hit: GoalSpeedHit
  series: GoalSpeedPoint[]
}

export type GoalSpeedTableRow = GoalSpeedPathResult & {
  key: string
  label: string
  extrasIncluded: { year: number; amount: number }[]
  fasterThanPrevious: GoalSpeedDuration | null
  /** Exact years saved vs previous path (not month-rounded). */
  fasterThanPreviousExact: number | null
  nowReaches: boolean
  /**
   * Exact time saved per unit of this row's contribution vs the last
   * contribution year. Last year is 1.
   */
  relativeEffectiveness: number | null
}

type Ymd = { y: number; m: number; d: number }

export type GoalSpeedSolveInput = {
  start: number
  goal: number
  ratePercent: number
  extras: { year: number; amount: number }[]
  today: Date
  maxYears?: number
}

function ymdFromDate(d: Date): Ymd {
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() }
}

function iso(p: Ymd): string {
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

function utcMs(p: Ymd): number {
  return Date.UTC(p.y, p.m - 1, p.d)
}

function ymdFromUtcMs(ms: number): Ymd {
  const d = new Date(ms)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}

function daysBetween(a: Ymd, b: Ymd): number {
  return (utcMs(b) - utcMs(a)) / 86_400_000
}

function dateAtYearFraction(year: number, t: number): Ymd {
  return ymdFromUtcMs(Date.UTC(year, 0, 1) + t * YEAR_MS)
}

function extrasByYear(
  extras: { year: number; amount: number }[],
  y0: number,
): Map<number, number> {
  const m = new Map<number, number>()
  for (const e of extras) {
    const y = Math.floor(e.year)
    if (!Number.isFinite(y) || y < y0) continue
    const amt = Number(e.amount)
    if (!Number.isFinite(amt) || !(amt > 0)) continue
    m.set(y, (m.get(y) ?? 0) + amt)
  }
  return m
}

export function splitMonths(totalMonths: number): GoalSpeedDuration {
  const sign = totalMonths < 0 ? -1 : 1
  const abs = Math.abs(Math.round(totalMonths))
  return {
    totalMonths: sign * abs,
    years: sign * Math.floor(abs / 12),
    months: sign * (abs % 12),
  }
}

export function durationBetween(from: Date | Ymd, to: Date | Ymd): GoalSpeedDuration {
  const a = from instanceof Date ? ymdFromDate(from) : from
  const b = to instanceof Date ? ymdFromDate(to) : to
  const days = Math.max(0, daysBetween(a, b))
  return splitMonths(Math.round(days / MONTH_DAYS))
}

export function formatGoalSpeedDuration(d: GoalSpeedDuration): string {
  if (d.totalMonths === 0) return '0m'
  const sign = d.totalMonths < 0 ? '−' : ''
  const y = Math.abs(d.years)
  const mo = Math.abs(d.months)
  const parts: string[] = []
  if (y) parts.push(`${y}y`)
  if (mo) parts.push(`${mo}m`)
  return sign + (parts.length ? parts.join(' ') : '0m')
}

function formatMax2(n: number): string {
  return String(Number(n.toFixed(2)))
}

/** Unrounded duration in years, months with at most 2 decimal places. */
export function formatGoalSpeedDurationExact(years: number): string {
  if (!Number.isFinite(years) || years === 0) return '0m'
  const sign = years < 0 ? '−' : ''
  const totalMonths = Math.abs(years) * 12
  const y = Math.floor(totalMonths / 12)
  const m = totalMonths - y * 12
  const parts: string[] = []
  if (y) parts.push(`${y}y`)
  if (m >= 0.005 || y === 0) parts.push(`${formatMax2(m)}m`)
  return sign + parts.join(' ')
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export function formatGoalSpeedDate(date: string): string {
  const [ys, ms, ds] = date.split('-')
  const y = Number(ys)
  const m = Number(ms)
  const d = Number(ds)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return date
  if (m === 12 && d === 31) return `31 Dec ${y}`
  return `${MONTH_NAMES[m - 1] ?? ms} ${y}`
}

/** Amount without currency (currency lives in the table header). */
export function formatGoalSpeedAmount(value: number): string {
  if (!Number.isFinite(value)) return '—'
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`
  if (abs >= 1e3) {
    const k = abs / 1e3
    const whole = Math.abs(k - Math.round(k)) < 0.05
    return `${sign}${whole ? String(Math.round(k)) : k.toFixed(1)}k`
  }
  if (abs >= 100) return `${sign}${abs.toFixed(0)}`
  return `${sign}${abs.toFixed(2)}`
}

/** Cumulative contributions as `30k + 30k + 15k`. */
export function formatGoalSpeedExtras(
  extras: { year: number; amount: number }[],
): string {
  if (extras.length === 0) return '—'
  return extras.map((e) => formatGoalSpeedAmount(e.amount)).join(' + ')
}

/**
 * How many times more a dollar contributed this year shortens time-to-goal
 * than a dollar at year-end `year`. Same timing as the path (no growth in the
 * contribution year). Infinitesimal / small-dollar limit: (1+r)^(year − now).
 */
export function relativeDollarEffectiveness(
  year: number,
  currentYear: number,
  ratePercent: number,
): number | null {
  const y = Math.floor(year)
  const y0 = Math.floor(currentYear)
  if (!Number.isFinite(y) || !Number.isFinite(y0) || y < y0) return null
  const r = Number.isFinite(ratePercent) ? ratePercent / 100 : 0
  if (!(r > 0)) return 1
  return (1 + r) ** (y - y0)
}

export function formatGoalSpeedRelEffect(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 100) return `${value.toFixed(0)}×`
  return `${value.toFixed(2)}×`
}

function tOf(today: Ymd, date: Ymd, tie = 0): number {
  return daysBetween(today, date) / 365.25 + tie
}

/**
 * Exact years from today to fraction `t` of calendar `year` (t=0 Jan 1, t=1 next Jan 1).
 * After this year, growth years are 365.25-day compounding years (not leap-day calendar).
 */
function yearsUntil(today: Ymd, year: number, t: number): number {
  const y0 = today.y
  const stub = (Date.UTC(y0 + 1, 0, 1) - utcMs(today)) / YEAR_MS
  if (year <= y0) return Math.max(0, stub - 1 + t)
  return Math.max(0, stub + (year - (y0 + 1)) + t)
}

function pushPoint(
  series: GoalSpeedPoint[],
  today: Ymd,
  date: Ymd,
  wealth: number,
  tie = 0,
  isHit = false,
): GoalSpeedPoint {
  const point: GoalSpeedPoint = {
    date: iso(date),
    t: tOf(today, date, tie),
    wealth,
    ...(isHit ? { isHit: true } : {}),
  }
  const last = series[series.length - 1]
  if (last && last.t === point.t) {
    last.wealth = wealth
    last.date = point.date
    if (isHit) last.isHit = true
    return last
  }
  series.push(point)
  return point
}

export function solveGoalSpeedPath(input: GoalSpeedSolveInput): GoalSpeedPathResult {
  const today = ymdFromDate(input.today)
  const y0 = today.y
  const G = input.goal
  const B = input.start
  const maxYears = input.maxYears ?? GOAL_SPEED_MAX_YEARS
  const series: GoalSpeedPoint[] = []
  const extras = extrasByYear(input.extras, y0)
  const r = Number.isFinite(input.ratePercent) ? input.ratePercent / 100 : 0
  const grow = r > 0

  const never = (): GoalSpeedPathResult => ({ hit: { reached: false }, series })

  if (!(G > 0) || !Number.isFinite(G) || !Number.isFinite(B)) return never()

  function reached(
    date: Ymd,
    wealth: number,
    already: boolean,
    exactYears: number,
    tie = 0,
  ): GoalSpeedPathResult {
    const p = pushPoint(series, today, date, wealth, tie, true)
    const years = Math.max(0, exactYears)
    return {
      hit: {
        reached: true,
        already,
        date: p.date,
        t: p.t,
        wealth,
        duration: splitMonths(years * 12),
        yearsFromToday: years,
      },
      series,
    }
  }

  pushPoint(series, today, today, B)
  if (B >= G) return reached(today, B, true, 0)

  const x0 = extras.get(y0) ?? 0
  const y0end: Ymd = { y: y0, m: 12, d: 31 }
  if (x0 > 0) pushPoint(series, today, y0end, B)
  let wealth = B + x0
  if (wealth >= G) {
    return reached(y0end, wealth, false, yearsUntil(today, y0, 1), x0 > 0 ? EXTRA_TIE : 0)
  }
  pushPoint(series, today, y0end, wealth, x0 > 0 ? EXTRA_TIE : 0)

  const lastYear = y0 + maxYears
  for (let Y = y0 + 1; Y <= lastYear; Y++) {
    const prev = wealth
    pushPoint(series, today, { y: Y, m: 1, d: 1 }, prev)

    if (grow && prev > 0) {
      const grown = prev * (1 + r)
      if (grown >= G) {
        const t = Math.log(G / prev) / Math.log(1 + r)
        if (!(t > 0)) return reached({ y: Y, m: 1, d: 1 }, G, false, yearsUntil(today, Y, 0))
        if (t >= 1 - 1e-12) {
          wealth = grown
          const eoy: Ymd = { y: Y, m: 12, d: 31 }
          if (wealth >= G) return reached(eoy, wealth, false, yearsUntil(today, Y, 1))
        } else {
          return reached(
            dateAtYearFraction(Y, t),
            G,
            false,
            yearsUntil(today, Y, t),
          )
        }
      } else {
        wealth = grown
      }
    }

    const eoy: Ymd = { y: Y, m: 12, d: 31 }
    const x = extras.get(Y) ?? 0
    if (x > 0) pushPoint(series, today, eoy, wealth)
    if (wealth < G && wealth + x >= G) {
      return reached(
        eoy,
        wealth + x,
        false,
        yearsUntil(today, Y, 1),
        x > 0 ? EXTRA_TIE : 0,
      )
    }
    wealth += x
    pushPoint(series, today, eoy, wealth, x > 0 ? EXTRA_TIE : 0)
    if (wealth >= G) {
      return reached(eoy, wealth, false, yearsUntil(today, Y, 1), x > 0 ? EXTRA_TIE : 0)
    }
  }

  return never()
}

export type GoalSpeedBreakdownStep = {
  year: number
  title: string
  prior: number | null
  grown: number | null
  contribution: number
  wealth: number
  grew: boolean
  hit: boolean
  hitDate: string | null
  note: string | null
}

/** Year-by-year walk of the same path as {@link solveGoalSpeedPath}. */
export function goalSpeedBreakdown(input: GoalSpeedSolveInput): GoalSpeedBreakdownStep[] {
  const today = ymdFromDate(input.today)
  const y0 = today.y
  const G = input.goal
  const B = input.start
  const maxYears = input.maxYears ?? GOAL_SPEED_MAX_YEARS
  const extras = extrasByYear(input.extras, y0)
  const r = Number.isFinite(input.ratePercent) ? input.ratePercent / 100 : 0
  const grow = r > 0
  const steps: GoalSpeedBreakdownStep[] = []

  steps.push({
    year: y0,
    title: 'Now',
    prior: null,
    grown: null,
    contribution: 0,
    wealth: B,
    grew: false,
    hit: Number.isFinite(B) && Number.isFinite(G) && B >= G && G > 0,
    hitDate: Number.isFinite(B) && Number.isFinite(G) && B >= G && G > 0 ? iso(today) : null,
    note: Number.isFinite(B) && Number.isFinite(G) && B >= G && G > 0 ? 'Already at the goal' : null,
  })
  if (!(G > 0) || !Number.isFinite(G) || !Number.isFinite(B) || B >= G) return steps

  const x0 = extras.get(y0) ?? 0
  let wealth = B + x0
  const hitY0 = wealth >= G
  steps.push({
    year: y0,
    title: String(y0),
    prior: B,
    grown: B,
    contribution: x0,
    wealth,
    grew: false,
    hit: hitY0,
    hitDate: hitY0 ? `${y0}-12-31` : null,
    note: 'No growth this year',
  })
  if (hitY0) return steps

  const lastYear = y0 + maxYears
  for (let Y = y0 + 1; Y <= lastYear; Y++) {
    const prev = wealth
    const x = extras.get(Y) ?? 0

    if (grow && prev > 0) {
      const grownFull = prev * (1 + r)
      if (grownFull >= G) {
        const t = Math.log(G / prev) / Math.log(1 + r)
        if (t > 0 && t < 1 - 1e-12) {
          const date = dateAtYearFraction(Y, t)
          steps.push({
            year: Y,
            title: String(Y),
            prior: prev,
            grown: G,
            contribution: 0,
            wealth: G,
            grew: true,
            hit: true,
            hitDate: iso(date),
            note: `Hits ${formatGoalSpeedDate(iso(date))}, before year-end contribution`,
          })
          return steps
        }
        wealth = grownFull
        if (wealth >= G && !(x > 0)) {
          steps.push({
            year: Y,
            title: String(Y),
            prior: prev,
            grown: wealth,
            contribution: 0,
            wealth,
            grew: true,
            hit: true,
            hitDate: `${Y}-12-31`,
            note: null,
          })
          return steps
        }
      } else {
        wealth = grownFull
      }
    }

    const grown = wealth
    wealth += x
    const hit = wealth >= G
    steps.push({
      year: Y,
      title: String(Y),
      prior: prev,
      grown,
      contribution: x,
      wealth,
      grew: grow && prev > 0,
      hit,
      hitDate: hit ? `${Y}-12-31` : null,
      note: null,
    })
    if (hit) return steps
  }
  return steps
}

function sortedUniqueExtras(
  extras: { year: number; amount: number }[],
  y0: number,
): { year: number; amount: number }[] {
  const m = extrasByYear(extras, y0)
  return [...m.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, amount]) => ({ year, amount }))
}

export function buildGoalSpeedTable(input: GoalSpeedSolveInput): GoalSpeedTableRow[] {
  const y0 = input.today.getFullYear()
  const unique = sortedUniqueExtras(input.extras, y0)
  const slices: { year: number; amount: number }[][] = [[]]
  let acc: { year: number; amount: number }[] = []
  for (const e of unique) {
    acc = [...acc, e]
    slices.push(acc)
  }

  const rows: GoalSpeedTableRow[] = []
  let prevDuration: GoalSpeedDuration | null = null
  let prevYears: number | null = null
  for (let i = 0; i < slices.length; i++) {
    const included = slices[i]!
    const path = solveGoalSpeedPath({ ...input, extras: included })
    const lastYear = included.length ? included[included.length - 1]!.year : null
    const fasterThanPreviousExact =
      i > 0 && path.hit.reached && prevYears != null
        ? prevYears - path.hit.yearsFromToday
        : null
    const fasterThanPrevious =
      fasterThanPreviousExact != null
        ? splitMonths(fasterThanPreviousExact * 12)
        : null
    const nowReaches = i > 0 && path.hit.reached && prevDuration == null
    rows.push({
      key: i === 0 ? 'base' : `plus-${lastYear}`,
      label: lastYear == null ? 'Base' : `+${lastYear}`,
      extrasIncluded: included,
      hit: path.hit,
      series: path.series,
      fasterThanPrevious,
      fasterThanPreviousExact,
      nowReaches,
      relativeEffectiveness: null,
    })
    prevDuration = path.hit.reached ? path.hit.duration : null
    prevYears = path.hit.reached ? path.hit.yearsFromToday : null
  }
  function amountThisYear(r: GoalSpeedTableRow): number {
    const e = r.extrasIncluded[r.extrasIncluded.length - 1]
    return e != null && e.amount > 0 ? e.amount : 0
  }
  function savedPerUnit(r: GoalSpeedTableRow): number | null {
    const amt = amountThisYear(r)
    if (r.fasterThanPreviousExact == null || !(amt > 0)) return null
    return r.fasterThanPreviousExact / amt
  }
  const lastPerUnit = rows.reduce(
    (acc, r) => savedPerUnit(r) ?? acc,
    null as number | null,
  )
  if (lastPerUnit != null && lastPerUnit > 0) {
    for (const r of rows) {
      const per = savedPerUnit(r)
      if (per == null) continue
      r.relativeEffectiveness = per / lastPerUnit
    }
  }
  return rows
}

export function goalSpeedBlockReason(args: {
  start: number
  goal: number
  ratePercent: number | null
  extrasCount: number
}): string | null {
  if (!(args.goal > 0)) return 'Enter a goal amount.'
  if (!(args.start > 0) && args.extrasCount === 0) {
    return 'Start is 0 — use Now, a custom start, or contributions.'
  }
  if (args.ratePercent == null) {
    return 'Enter a compounding rate, or set perpetual growth on the portfolio.'
  }
  return null
}

export type GoalSpeedChartRow = {
  t: number
  date: string
  goal: number
  [key: string]: number | string | null
}

function wealthAtT(points: GoalSpeedPoint[], t: number): number | null {
  if (points.length === 0) return null
  const first = points[0]!
  const last = points[points.length - 1]!
  if (t < first.t - 1e-9) return null
  if (t > last.t + 1e-9) return null
  if (t <= first.t) return first.wealth
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!
    const b = points[i]!
    if (t <= b.t) {
      const span = b.t - a.t
      if (span <= 0) return b.wealth
      const u = (t - a.t) / span
      return a.wealth + u * (b.wealth - a.wealth)
    }
  }
  return last.wealth
}

export function mergeGoalSpeedSeries(
  rows: GoalSpeedTableRow[],
  goal: number,
): GoalSpeedChartRow[] {
  const ts = new Map<number, string>()
  for (const row of rows) {
    for (const p of row.series) {
      if (!ts.has(p.t)) ts.set(p.t, p.date)
    }
  }
  const sorted = [...ts.keys()].sort((a, b) => a - b)
  return sorted.map((t) => {
    const out: GoalSpeedChartRow = { t, date: ts.get(t)!, goal }
    for (const row of rows) {
      out[row.key] = wealthAtT(row.series, t)
    }
    return out
  })
}
