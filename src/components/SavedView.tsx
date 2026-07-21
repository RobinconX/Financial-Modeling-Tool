import { useEffect, useMemo, useState } from 'react'
import type { AnalyzerLoadState, SavedScenario, ValuationBasis } from '../types'
import { fetchQuoteClient } from '../lib/quote'
import { effectiveMarketCap } from '../lib/sharePrice'
import {
  buildAdvancedProjections,
  buildChartSeries,
  buildEasyProjections,
  pickHeroRow,
} from '../lib/valuation'
import { formatMoney, formatPrice } from '../lib/format'
import { ScenarioList } from './ScenarioList'
import { EasyAssumptionsTable } from './EasyAssumptionsTable'
import { AdvancedAssumptionsTable } from './AdvancedAssumptionsTable'
import { RoiHero } from './RoiHero'
import { MarketCapChart } from './MarketCapChart'
import { FullscreenChart } from './FullscreenChart'

type Props = {
  scenarios: SavedScenario[]
  grouped: { symbol: string; scenarios: SavedScenario[] }[]
  storageError: string | null
  updateScenario: (id: string, patch: Partial<SavedScenario>) => boolean
  deleteScenario: (id: string) => boolean
  onOpenInAnalyzer: (state: AnalyzerLoadState) => void
}

const LIST_COLLAPSED_KEY = 'grok-lab-saved-list-collapsed'

function readListCollapsed(): boolean {
  try {
    return localStorage.getItem(LIST_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function SavedView({
  scenarios,
  grouped,
  storageError,
  updateScenario,
  deleteScenario,
  onOpenInAnalyzer,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    () => scenarios[0]?.id ?? null,
  )
  const [selectedBasis, setSelectedBasis] = useState<ValuationBasis | 'easy'>('easy')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [listCollapsed, setListCollapsed] = useState(readListCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(LIST_COLLAPSED_KEY, listCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [listCollapsed])

  // Keep selection valid when list changes
  useEffect(() => {
    if (selectedId && scenarios.some((s) => s.id === selectedId)) return
    setSelectedId(scenarios[0]?.id ?? null)
  }, [scenarios, selectedId])

  const selected = scenarios.find((s) => s.id === selectedId) ?? null

  const currentMarketCap = selected
    ? effectiveMarketCap(selected.mcapOverride, selected.currentMarketCap)
    : null

  const easyProjections = useMemo(() => {
    if (!selected || currentMarketCap == null) return []
    return buildEasyProjections(currentMarketCap, selected.easyRows)
  }, [selected, currentMarketCap])

  const advancedProjections = useMemo(() => {
    if (!selected || currentMarketCap == null) return []
    return buildAdvancedProjections(currentMarketCap, selected.advancedRows)
  }, [selected, currentMarketCap])

  const allProjections = useMemo(
    () => [...easyProjections, ...advancedProjections],
    [easyProjections, advancedProjections],
  )

  // Prefer easy hero if available, else selected advanced basis
  useEffect(() => {
    if (!selected) return
    if (easyProjections.length > 0) setSelectedBasis('easy')
    else if (advancedProjections.some((p) => p.basis === 'ps')) setSelectedBasis('ps')
    else if (advancedProjections.some((p) => p.basis === 'pfcf')) setSelectedBasis('pfcf')
    else if (advancedProjections.some((p) => p.basis === 'pe')) setSelectedBasis('pe')
  }, [selected?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hero = selected ? pickHeroRow(allProjections, selectedBasis) : null
  const secondary =
    selectedBasis === 'easy'
      ? easyProjections.filter((r) => hero && r.year !== hero.year)
      : (['ps', 'pfcf', 'pe'] as ValuationBasis[])
          .filter((b) => b !== selectedBasis)
          .map((b) => pickHeroRow(advancedProjections, b))
          .filter((r): r is NonNullable<typeof r> => r != null)

  const easyChart = useMemo(() => {
    if (!selected || currentMarketCap == null) return []
    return buildChartSeries(
      currentMarketCap,
      'easy',
      selected.easyRows,
      selected.advancedRows,
    )
  }, [selected, currentMarketCap])

  const advancedChart = useMemo(() => {
    if (!selected || currentMarketCap == null) return []
    return buildChartSeries(
      currentMarketCap,
      'advanced',
      selected.easyRows,
      selected.advancedRows,
    )
  }, [selected, currentMarketCap])

  async function refreshQuote() {
    if (!selected) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const q = await fetchQuoteClient(selected.symbol)
      updateScenario(selected.id, {
        companyName: q.name,
        currency: q.currency,
        currentPrice: q.price,
        currentMarketCap: q.marketCap,
        sharesOutstanding: q.sharesOutstanding,
      })
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      className={`grid gap-6 ${listCollapsed ? '' : 'lg:grid-cols-[260px_1fr]'}`}
    >
      {listCollapsed ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <button
            type="button"
            className="btn-ghost !px-2 !py-1 !text-xs"
            onClick={() => setListCollapsed(false)}
            title="Show projections list"
          >
            » Projections
          </button>
          {selected && (
            <span className="truncate text-sm text-white/70">
              <span className="text-white/40">Active · </span>
              {selected.symbol} · {selected.name}
            </span>
          )}
        </div>
      ) : (
        <aside className="card max-h-[calc(100vh-12rem)] overflow-y-auto p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Saved projections</h2>
            <button
              type="button"
              className="btn-ghost !px-2 !py-1 !text-[11px]"
              onClick={() => setListCollapsed(true)}
              title="Hide projections list"
            >
              « Hide
            </button>
          </div>
          {storageError && (
            <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
              {storageError}
            </p>
          )}
          <ScenarioList
            groups={grouped}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={(id) => {
              deleteScenario(id)
            }}
          />
        </aside>
      )}

      <div className="min-w-0 space-y-5">
        {!selected ? (
          <div className="card flex h-64 items-center justify-center p-8 text-sm text-white/40">
            Select a projection or save one from the Analyzer.
          </div>
        ) : (
          <>
            <header className="card space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
                    {selected.symbol}
                  </p>
                  <input
                    className="mt-1 w-full max-w-md border-0 bg-transparent text-2xl font-bold text-white outline-none focus:ring-0"
                    value={selected.name}
                    onChange={(e) => updateScenario(selected.id, { name: e.target.value })}
                    aria-label="Scenario name"
                  />
                  {selected.companyName && (
                    <p className="text-sm text-white/45">{selected.companyName}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={refreshing}
                    onClick={() => void refreshQuote()}
                  >
                    {refreshing ? 'Refreshing…' : 'Refresh quote'}
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() =>
                      onOpenInAnalyzer({
                        symbol: selected.symbol,
                        companyName: selected.companyName,
                        currency: selected.currency,
                        currentPrice: selected.currentPrice,
                        currentMarketCap: selected.currentMarketCap,
                        sharesOutstanding: selected.sharesOutstanding,
                        mcapOverride: selected.mcapOverride,
                        easyRows: selected.easyRows,
                        advancedRows: selected.advancedRows,
                      })
                    }
                  >
                    Open in Analyzer
                  </button>
                </div>
              </div>

              {refreshError && (
                <p className="text-sm text-red-300">{refreshError}</p>
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Meta
                  label="Price"
                  value={formatPrice(selected.currentPrice, selected.currency)}
                />
                <Meta
                  label="Market cap"
                  value={formatMoney(selected.currentMarketCap, selected.currency)}
                />
                <Meta
                  label="Shares"
                  value={
                    selected.sharesOutstanding != null
                      ? formatMoney(selected.sharesOutstanding, selected.currency).replace(
                          /^\$/,
                          '',
                        )
                      : '—'
                  }
                />
                <Meta
                  label="Effective mcap"
                  value={formatMoney(currentMarketCap, selected.currency)}
                />
              </div>

              <div className="max-w-xs">
                <label className="label">Market cap override</label>
                <input
                  className="input"
                  type="text"
                  placeholder="Optional"
                  defaultValue={
                    selected.mcapOverride == null ? '' : String(selected.mcapOverride)
                  }
                  key={`mcap-${selected.id}-${selected.mcapOverride}`}
                  onBlur={(e) => {
                    const raw = e.target.value.trim()
                    if (!raw) {
                      updateScenario(selected.id, { mcapOverride: null })
                      return
                    }
                    const n = Number(raw.replace(/[$,\s]/g, ''))
                    // try parseMoney-like
                    const upper = raw.toUpperCase().replace(/[$,\s]/g, '')
                    const m = upper.match(/^([\d.]+)([KMBT])?$/)
                    if (!m) return
                    const base = Number(m[1])
                    const mult =
                      m[2] === 'T'
                        ? 1e12
                        : m[2] === 'B'
                          ? 1e9
                          : m[2] === 'M'
                            ? 1e6
                            : m[2] === 'K'
                              ? 1e3
                              : 1
                    if (Number.isFinite(base)) {
                      updateScenario(selected.id, { mcapOverride: base * mult })
                    } else if (Number.isFinite(n)) {
                      updateScenario(selected.id, { mcapOverride: n })
                    }
                  }}
                />
              </div>
            </header>

            <RoiHero
              hero={hero}
              secondary={secondary}
              selectedBasis={selectedBasis}
              onSelectBasis={setSelectedBasis}
              showBasisTabs
              showEasyTab={easyProjections.length > 0}
              currency={selected.currency}
              currentMarketCap={currentMarketCap}
            />

            <div className="card space-y-6 p-5">
              <EasyAssumptionsTable
                rows={selected.easyRows}
                onChange={(easyRows) => updateScenario(selected.id, { easyRows })}
                currentMarketCap={currentMarketCap}
                sharesOutstanding={selected.sharesOutstanding}
                currency={selected.currency}
              />
              <AdvancedAssumptionsTable
                rows={selected.advancedRows}
                onChange={(advancedRows) => updateScenario(selected.id, { advancedRows })}
                currentMarketCap={currentMarketCap}
                sharesOutstanding={selected.sharesOutstanding}
                currency={selected.currency}
              />
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="card p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
                  Easy · mcap path
                </h3>
                <FullscreenChart title="Easy · mcap path">
                  <MarketCapChart data={easyChart} mode="easy" currency={selected.currency} />
                </FullscreenChart>
              </div>
              <div className="card p-5">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
                  Advanced · mcap path
                </h3>
                <FullscreenChart title="Advanced · mcap path">
                  <MarketCapChart
                    data={advancedChart}
                    mode="advanced"
                    currency={selected.currency}
                  />
                </FullscreenChart>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-white/40">{label}</div>
      <div className="truncate text-sm font-semibold tabular-nums text-white/90">{value}</div>
    </div>
  )
}
