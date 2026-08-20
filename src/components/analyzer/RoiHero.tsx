import { formatMoney, formatPercent } from '../../lib/format'
import type { ProjectionRow, ValuationBasis } from '../../types'

const BASIS_LABEL: Record<ValuationBasis | 'easy', string> = {
  easy: 'Easy projection',
  ps: 'P/S basis',
  pfcf: 'P/FCF basis',
  pe: 'P/E basis',
}

type Props = {
  hero: ProjectionRow | null
  secondary: ProjectionRow[]
  selectedBasis: ValuationBasis | 'easy'
  onSelectBasis?: (basis: ValuationBasis | 'easy') => void
  showBasisTabs?: boolean
  /** Include Easy tab alongside P/S · P/FCF · P/E (Saved view) */
  showEasyTab?: boolean
  currency?: string
  currentMarketCap: number | null
}

export function RoiHero({
  hero,
  secondary,
  selectedBasis,
  onSelectBasis,
  showBasisTabs,
  showEasyTab,
  currency = 'USD',
  currentMarketCap,
}: Props) {
  const cagr = hero?.cagr
  const positive = cagr != null && Number.isFinite(cagr) && cagr >= 0
  const negative = cagr != null && Number.isFinite(cagr) && cagr < 0

  const tabs: (ValuationBasis | 'easy')[] = showEasyTab
    ? ['easy', 'ps', 'pfcf', 'pe']
    : ['ps', 'pfcf', 'pe']

  return (
    <div className="panel relative overflow-hidden border-emerald-500/15 bg-gradient-to-br from-emerald-500/10 via-white/[0.02] to-transparent">
      <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />

      {showBasisTabs && onSelectBasis && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {tabs.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => onSelectBasis(b)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                selectedBasis === b
                  ? 'bg-white text-black'
                  : 'bg-white/5 text-white/60 hover:bg-white/10'
              }`}
            >
              {BASIS_LABEL[b]}
            </button>
          ))}
        </div>
      )}

      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/80">
        ROI p.a. · {BASIS_LABEL[selectedBasis]}
        {hero ? ` · to EOY ${hero.year}` : ''}
      </div>

      <div
        className={`mt-1 text-5xl font-bold tracking-tight tabular-nums sm:text-6xl ${
          positive ? 'text-emerald-400' : negative ? 'text-red-400' : 'text-white/40'
        }`}
      >
        {cagr != null && Number.isFinite(cagr) ? formatPercent(cagr) : '—'}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Stat
          label="Total return"
          value={hero && Number.isFinite(hero.totalReturn) ? formatPercent(hero.totalReturn) : '—'}
        />
        <Stat
          label="Horizon"
          value={hero ? formatHorizon(hero.years) : '—'}
        />
        <Stat
          label="Implied mcap"
          value={hero ? formatMoney(hero.marketCap, currency) : '—'}
        />
        {hero && hero.basis !== 'easy' && Math.abs(hero.dilutionFactor - 1) >= 1e-9 && (
          <>
            <Stat label="Dilution" value={`${hero.dilutionFactor.toFixed(2)}× shares`} />
            <Stat label="Equity value" value={formatMoney(hero.equityValue, currency)} />
          </>
        )}
      </div>

      {currentMarketCap != null && currentMarketCap > 0 && hero ? (
        <p className="mt-3 text-xs text-white/40">
          {formatMoney(currentMarketCap, currency)}
          {hero.basis !== 'easy' && Math.abs(hero.dilutionFactor - 1) >= 1e-9
            ? ` → equity ${formatMoney(hero.equityValue, currency)} in ${hero.year}`
            : ` → ${formatMoney(hero.marketCap, currency)} in ${hero.year}`}
        </p>
      ) : null}

      {secondary.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {secondary.map((row) => (
            <button
              key={`${row.basis}-${row.year}`}
              type="button"
              onClick={() => onSelectBasis?.(row.basis)}
              className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-left text-xs transition hover:border-white/25"
            >
              <span className="text-white/45">{row.year}</span>
              <span
                className={`ml-2 font-semibold tabular-nums ${
                  row.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {formatPercent(row.cagr)}
              </span>
              <span className="ml-1.5 text-white/35 tabular-nums">
                {formatMoney(row.marketCap, currency)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatHorizon(years: number): string {
  if (!Number.isFinite(years) || years < 0) return '—'
  const rounded = Math.round(years * 10) / 10
  return `${rounded} yr${rounded === 1 ? '' : 's'}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="font-semibold tabular-nums text-white/90">{value}</div>
    </div>
  )
}
