/**
 * Settings → **Portfolio** — one panel for portfolio-wide preferences (cash mode, actuals mode, …).
 * Add new portfolio-related settings as a sub-block here (`data-guide-anchor` per sub-feature).
 * Registry: parent guide `settings.portfolio`; child guides under `settings.portfolio*`.
 */
import { FeatureGuideButton } from '../guides/FeatureGuideButton'
import type { PortfolioActualsMode } from '../../lib/portfolioActualsMode'
import type { PortfolioCashMode } from '../../lib/portfolioCashMode'
import type {
  PortfolioActualsState,
  PortfolioContributionsState,
  PortfolioSharedCashState,
} from '../../types'

type Props = {
  busy: boolean
  portfolioCashMode: PortfolioCashMode
  onRequestCashMode: (mode: PortfolioCashMode) => void
  sharedCash: PortfolioSharedCashState
  cashModeError: string | null
  portfolioActualsMode: PortfolioActualsMode
  onRequestActualsMode: (mode: PortfolioActualsMode) => void
  portfolioActuals: PortfolioActualsState
  portfolioContributions: PortfolioContributionsState
  actualsModeError: string | null
}

export function SettingsPortfolioSection({
  busy,
  portfolioCashMode,
  onRequestCashMode,
  sharedCash,
  cashModeError,
  portfolioActualsMode,
  onRequestActualsMode,
  portfolioActuals,
  portfolioContributions,
  actualsModeError,
}: Props) {
  return (
    <section className="panel space-y-5" data-guide-anchor="settings.portfolio">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title text-amber-300/90">Portfolio</h3>
          <FeatureGuideButton id="settings.portfolio" />
        </div>
        <p className="text-sm text-white/55">
          Shared vs separate-per-book modes for cash plans and recorded actuals.
        </p>
      </div>

      <div
        className="space-y-3 border-t border-white/[0.08] pt-4"
        data-guide-anchor="settings.portfolioCash"
      >
        <div className="flex items-center gap-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-300/80">
            Cash
          </h4>
          <FeatureGuideButton id="settings.portfolioCash" />
        </div>
        <p className="text-sm text-white/50">
          Each book has its own cash plan, or one shared plan for every book.
        </p>
        <div
          className="inline-flex gap-1 border-b border-white/10"
          role="group"
          aria-label="Portfolio cash mode"
        >
          {(
            [
              { id: 'perPortfolio' as const, label: 'Separate per portfolio' },
              { id: 'shared' as const, label: 'Shared cash' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={() => onRequestCashMode(opt.id)}
              className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                portfolioCashMode === opt.id
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {portfolioCashMode === 'shared' ? (
          <p className="text-[11px] text-white/40">
            Display currency for shared cash:{' '}
            <span className="text-white/70">{sharedCash.currency}</span>
          </p>
        ) : null}
        {cashModeError ? <p className="text-sm text-amber-300/90">{cashModeError}</p> : null}
      </div>

      <div
        className="space-y-3 border-t border-white/[0.08] pt-4"
        data-guide-anchor="settings.portfolioActuals"
      >
        <div className="flex items-center gap-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-300/80">
            Actuals
          </h4>
          <FeatureGuideButton id="settings.portfolioActuals" />
        </div>
        <p className="text-sm text-white/50">
          Each book keeps its own value actuals and money-in, or one shared record (default).
        </p>
        <div
          className="inline-flex gap-1 border-b border-white/10"
          role="group"
          aria-label="Portfolio actuals mode"
        >
          {(
            [
              { id: 'shared' as const, label: 'Shared actuals' },
              { id: 'perPortfolio' as const, label: 'Separate per portfolio' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={() => onRequestActualsMode(opt.id)}
              className={`-mb-px border-b-2 px-2.5 py-1 text-xs font-medium transition ${
                portfolioActualsMode === opt.id
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {portfolioActualsMode === 'shared' ? (
          <p className="text-[11px] text-white/40">
            Display currency for shared actuals:{' '}
            <span className="text-white/70">{portfolioActuals.currency}</span>
            {' · '}
            Money in: <span className="text-white/70">{portfolioContributions.currency}</span>
          </p>
        ) : null}
        {actualsModeError ? (
          <p className="text-sm text-amber-300/90">{actualsModeError}</p>
        ) : null}
      </div>
    </section>
  )
}
