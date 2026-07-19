import { formatPercent } from '../lib/format'
import { effectiveMarketCap } from '../lib/sharePrice'
import {
  buildAdvancedProjections,
  buildEasyProjections,
  pickHeroRow,
} from '../lib/valuation'
import type { SavedScenario } from '../types'

type Group = { symbol: string; scenarios: SavedScenario[] }

type Props = {
  groups: Group[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
}

function heroCagr(sc: SavedScenario): number | null {
  const mcap = effectiveMarketCap(sc.mcapOverride, sc.currentMarketCap)
  if (mcap == null) return null
  const easy = buildEasyProjections(mcap, sc.easyRows)
  const adv = buildAdvancedProjections(mcap, sc.advancedRows)
  const hero =
    pickHeroRow(easy, 'easy') ??
    pickHeroRow(adv, 'ps') ??
    pickHeroRow(adv, 'pfcf') ??
    pickHeroRow(adv, 'pe')
  return hero && Number.isFinite(hero.cagr) ? hero.cagr : null
}

export function ScenarioList({ groups, selectedId, onSelect, onDelete }: Props) {
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/40">
        No saved projections yet. Save one from the Analyzer tab.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.symbol}>
          <h3 className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-emerald-400/80">
            {group.symbol}
          </h3>
          <ul className="space-y-1">
            {group.scenarios.map((sc) => {
              const cagr = heroCagr(sc)
              const selected = sc.id === selectedId
              return (
                <li key={sc.id}>
                  <div
                    className={`flex items-center gap-1 rounded-lg border transition ${
                      selected
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-transparent bg-white/[0.03] hover:border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(sc.id)}
                      className="min-w-0 flex-1 px-3 py-2 text-left"
                    >
                      <div className="truncate text-sm font-medium text-white">{sc.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-white/40">
                        <span>
                          {new Date(sc.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                        {cagr != null && (
                          <span
                            className={`font-semibold tabular-nums ${
                              cagr >= 0 ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            ROI {formatPercent(cagr)}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="mr-1 shrink-0 rounded-md px-2 py-1 text-[11px] text-white/40 hover:bg-red-500/20 hover:text-red-300"
                      title="Delete scenario"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete ${sc.symbol} · ${sc.name}?`)) onDelete(sc.id)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}
