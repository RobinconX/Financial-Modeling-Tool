import { formatMoney, formatPercent } from '../../lib/format'
import type { ProjectionRow, ValuationBasis } from '../../types'

const BASIS_LABEL: Record<ValuationBasis | 'easy', string> = {
  easy: 'Easy',
  ps: 'P/S',
  pfcf: 'P/FCF',
  pe: 'P/E',
}

type Props = {
  hero: ProjectionRow | null
  selectedBasis: ValuationBasis | 'easy'
  onSelectBasis: (basis: ValuationBasis | 'easy') => void
  showEasyTab?: boolean
  currency?: string
}

export function RoiHero({
  hero,
  selectedBasis,
  onSelectBasis,
  showEasyTab,
  currency = 'USD',
}: Props) {
  const cagr = hero?.cagr
  const positive = cagr != null && Number.isFinite(cagr) && cagr >= 0
  const negative = cagr != null && Number.isFinite(cagr) && cagr < 0
  const tabs: (ValuationBasis | 'easy')[] = showEasyTab
    ? ['easy', 'ps', 'pfcf', 'pe']
    : ['ps', 'pfcf', 'pe']

  return (
    <div className="border-t border-white/[0.06] pt-3">
      <div className="flex flex-wrap items-center gap-1">
        {tabs.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onSelectBasis(b)}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
              selectedBasis === b
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:text-white/70'
            }`}
          >
            {BASIS_LABEL[b]}
          </button>
        ))}
      </div>

      <p className="mt-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
        CAGR
        {hero ? ` · ${BASIS_LABEL[selectedBasis]} · EOY ${hero.year}` : ` · ${BASIS_LABEL[selectedBasis]}`}
      </p>
      <p
        className={`text-3xl font-bold tracking-tight tabular-nums ${
          positive ? 'text-emerald-400' : negative ? 'text-red-400' : 'text-white/35'
        }`}
      >
        {cagr != null && Number.isFinite(cagr) ? formatPercent(cagr, 2) : '—'}
      </p>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <Stat
          label="Total"
          value={hero && Number.isFinite(hero.totalReturn) ? formatPercent(hero.totalReturn, 2) : '—'}
        />
        <Stat label="Horizon" value={hero ? formatHorizon(hero.years) : '—'} />
        <Stat
          label="Implied mcap"
          value={hero ? formatMoney(hero.marketCap, currency) : '—'}
        />
      </div>
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
      <div className="text-[10px] uppercase tracking-wider text-white/35">{label}</div>
      <div className="font-medium tabular-nums text-white/80">{value}</div>
    </div>
  )
}
