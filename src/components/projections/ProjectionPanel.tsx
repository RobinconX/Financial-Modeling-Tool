import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type {
  EasyProjection,
  Quote,
  SavedScenario,
  ValuationBasis,
  YearProjection,
} from '../../types'
import { fetchQuoteClient } from '../../lib/quote'
import {
  buildAdvancedProjections,
  buildChartSeries,
  buildEasyProjections,
  newEasyProjection,
  pickHeroRow,
} from '../../lib/valuation'
import { formatMoney, formatPrice } from '../../lib/format'
import {
  impliedSharePrice,
  marketCapFromSharePrice,
  resolveSharesOutstanding,
} from '../../lib/sharePrice'
import { TickerSearch } from '../analyzer/TickerSearch'
import { EasyInputs } from '../analyzer/EasyInputs'
import { AdvancedInputs } from '../analyzer/AdvancedInputs'
import { RoiHero } from '../analyzer/RoiHero'
import { ProjectionTable } from '../analyzer/ProjectionTable'
import { SaveScenarioButton } from '../analyzer/SaveScenarioButton'
import { MarketCapChart } from '../charts/MarketCapChart'
import { FullscreenChart } from '../common/FullscreenChart'
import { InfoTip } from '../common/InfoTip'
import { MoneyInput } from '../common/MoneyInput'

type SaveInput = Omit<SavedScenario, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

type Props = {
  /** Panel label (e.g. Company A in compare) */
  title?: string
  /**
   * Saved scenario to edit (auto-persist). Null = draft (TickerSearch + Save).
   */
  scenario: SavedScenario | null
  onUpsertScenario: (
    input: SaveInput,
  ) => { scenario: SavedScenario; overwritten: boolean } | { error: string }
  onUpdateScenario: (id: string, patch: Partial<SavedScenario>) => boolean
  /** After draft is saved, parent should select the new id */
  onDraftSaved?: (scenario: SavedScenario) => void
  /** Parent handles portfolio usage confirm */
  onDelete?: (id: string) => void
}

function scenarioToQuote(sc: SavedScenario): Quote {
  return {
    symbol: sc.symbol,
    name: sc.companyName ?? sc.symbol,
    price: sc.currentPrice ?? 0,
    currency: sc.currency,
    marketCap: sc.currentMarketCap,
    sharesOutstanding: sc.sharesOutstanding,
  }
}

export function ProjectionPanel({
  title,
  scenario,
  onUpsertScenario,
  onUpdateScenario,
  onDraftSaved,
  onDelete,
}: Props) {
  const currentYear = new Date().getFullYear()
  const isDraft = scenario == null
  const scenarioId = scenario?.id ?? null

  // --- Draft-local state ---
  const [draftQuote, setDraftQuote] = useState<Quote | null>(null)
  const [draftMcapOverride, setDraftMcapOverride] = useState<number | null>(null)
  const [draftEasy, setDraftEasy] = useState<EasyProjection[]>([newEasyProjection()])
  const [draftAdvanced, setDraftAdvanced] = useState<YearProjection[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [selectedBasis, setSelectedBasis] = useState<ValuationBasis | 'easy'>('easy')
  /** Assumptions collapsed by default so ROI / charts lead; expand to edit. */
  const [easyOpen, setEasyOpen] = useState(isDraft)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  // Reset draft when switching into draft mode
  useEffect(() => {
    if (!isDraft) return
    setDraftQuote(null)
    setDraftMcapOverride(null)
    setDraftEasy([newEasyProjection()])
    setDraftAdvanced([])
    setFetchError(null)
    setRefreshError(null)
    setSelectedBasis('easy')
    setEasyOpen(true)
    setAdvancedOpen(false)
  }, [isDraft, scenarioId])

  // Prefer easy hero when switching saved scenario; collapse assumptions
  useEffect(() => {
    if (!scenario) return
    setSelectedBasis('easy')
    setRefreshError(null)
    setEasyOpen(false)
    setAdvancedOpen(false)
  }, [scenario?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const quote: Quote | null = isDraft ? draftQuote : scenario ? scenarioToQuote(scenario) : null
  const mcapOverride = isDraft ? draftMcapOverride : (scenario?.mcapOverride ?? null)
  const easyRows = isDraft ? draftEasy : (scenario?.easyRows ?? [])
  const advancedRows = isDraft ? draftAdvanced : (scenario?.advancedRows ?? [])

  const currency = quote?.currency ?? scenario?.currency ?? 'USD'
  const sharesOutstanding = resolveSharesOutstanding({
    sharesOutstanding: quote?.sharesOutstanding ?? scenario?.sharesOutstanding ?? null,
    marketCap: quote?.marketCap ?? scenario?.currentMarketCap ?? null,
    price: quote?.price ?? scenario?.currentPrice ?? null,
    mcapOverride,
  })
  const liveMcap = quote?.marketCap ?? scenario?.currentMarketCap ?? null
  const currentMarketCap = mcapOverride ?? liveMcap
  const currentSharePrice =
    impliedSharePrice(currentMarketCap, sharesOutstanding) ??
    (quote?.price != null && quote.price > 0 ? quote.price : null)

  function setMcapOverride(v: number | null) {
    if (isDraft) {
      setDraftMcapOverride(v)
      return
    }
    if (scenarioId) onUpdateScenario(scenarioId, { mcapOverride: v })
  }

  function setEasyRows(rows: EasyProjection[]) {
    if (isDraft) {
      setDraftEasy(rows)
      return
    }
    if (scenarioId) onUpdateScenario(scenarioId, { easyRows: rows })
  }

  function setAdvancedRows(rows: YearProjection[]) {
    if (isDraft) {
      setDraftAdvanced(rows)
      return
    }
    if (scenarioId) onUpdateScenario(scenarioId, { advancedRows: rows })
  }

  function setSharePriceOverride(sharePrice: number | null) {
    if (sharePrice == null) {
      setMcapOverride(null)
      return
    }
    const mcap = marketCapFromSharePrice(sharePrice, sharesOutstanding)
    if (mcap != null) setMcapOverride(mcap)
  }

  async function handleFetch(symbol: string) {
    if (!isDraft) return // ticker locked when saved
    const prevSymbol = draftQuote?.symbol?.toUpperCase() ?? null
    setLoading(true)
    setFetchError(null)
    try {
      const q = await fetchQuoteClient(symbol)
      setDraftQuote(q)
      setDraftMcapOverride(null)
      if (prevSymbol !== q.symbol.toUpperCase()) {
        setDraftEasy([newEasyProjection()])
        setDraftAdvanced([])
        setSelectedBasis('easy')
      }
    } catch (err) {
      setDraftQuote(null)
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch quote')
    } finally {
      setLoading(false)
    }
  }

  async function refreshQuote() {
    const symbol = quote?.symbol ?? scenario?.symbol
    if (!symbol) return
    setRefreshing(true)
    setRefreshError(null)
    try {
      const q = await fetchQuoteClient(symbol)
      if (q.symbol.toUpperCase() !== symbol.toUpperCase()) return
      if (isDraft) {
        setDraftQuote(q)
      } else if (scenarioId) {
        const derivedShares = resolveSharesOutstanding({
          sharesOutstanding: q.sharesOutstanding,
          marketCap: q.marketCap,
          price: q.price,
        })
        onUpdateScenario(scenarioId, {
          companyName: q.name,
          currency: q.currency,
          currentPrice: q.price,
          currentMarketCap: q.marketCap ?? scenario?.currentMarketCap ?? null,
          sharesOutstanding: derivedShares ?? scenario?.sharesOutstanding ?? null,
          // symbol intentionally not updated — ticker locked
        })
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : 'Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  // Quiet refresh for open draft ticker
  useEffect(() => {
    if (!isDraft || !draftQuote?.symbol) return
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const q = await fetchQuoteClient(draftQuote.symbol)
          if (q.symbol.toUpperCase() === draftQuote.symbol.toUpperCase()) {
            setDraftQuote(q)
          }
        } catch {
          /* ignore */
        }
      })()
    }, 5 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [isDraft, draftQuote?.symbol])

  const easyProjections = useMemo(() => {
    if (currentMarketCap == null || currentMarketCap <= 0) return []
    return buildEasyProjections(currentMarketCap, easyRows)
  }, [currentMarketCap, easyRows])

  const advancedProjections = useMemo(() => {
    if (currentMarketCap == null || currentMarketCap <= 0) return []
    return buildAdvancedProjections(currentMarketCap, advancedRows)
  }, [currentMarketCap, advancedRows])

  const allProjections = useMemo(
    () => [...easyProjections, ...advancedProjections],
    [easyProjections, advancedProjections],
  )

  const easyChart = useMemo(() => {
    if (currentMarketCap == null || currentMarketCap <= 0) return []
    return buildChartSeries(currentMarketCap, 'easy', easyRows, advancedRows, currentYear)
  }, [currentMarketCap, easyRows, advancedRows, currentYear])

  const advancedChart = useMemo(() => {
    if (currentMarketCap == null || currentMarketCap <= 0) return []
    return buildChartSeries(currentMarketCap, 'advanced', easyRows, advancedRows, currentYear)
  }, [currentMarketCap, easyRows, advancedRows, currentYear])

  useEffect(() => {
    if (easyProjections.length > 0 && selectedBasis === 'easy') return
    if (selectedBasis !== 'easy' && advancedProjections.some((p) => p.basis === selectedBasis)) {
      return
    }
    if (easyProjections.length > 0) setSelectedBasis('easy')
    else if (advancedProjections.some((p) => p.basis === 'ps')) setSelectedBasis('ps')
    else if (advancedProjections.some((p) => p.basis === 'pfcf')) setSelectedBasis('pfcf')
    else if (advancedProjections.some((p) => p.basis === 'pe')) setSelectedBasis('pe')
  }, [scenarioId, easyProjections.length, advancedProjections]) // eslint-disable-line react-hooks/exhaustive-deps

  const hero = pickHeroRow(allProjections, selectedBasis)
  const secondary = allProjections.filter(
    (r) => r.basis === selectedBasis && (!hero || r.year !== hero.year),
  )

  function handleSave(
    input: SaveInput,
  ): { scenario: SavedScenario; overwritten: boolean } | { error: string } {
    const result = onUpsertScenario(input)
    if ('scenario' in result && isDraft) {
      onDraftSaved?.(result.scenario)
    }
    return result
  }

  const hasAdvData = advancedProjections.length > 0

  const easyFilled = easyRows.filter(
    (r) => r.projectedMarketCap != null && r.projectedMarketCap > 0,
  ).length
  const advFilled = advancedRows.filter((r) =>
    [r.revenue, r.fcf, r.profit].some((v) => v != null && v > 0),
  ).length

  return (
    <section className="panel flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {title ? <p className="section-kicker">{title}</p> : null}
          {isDraft ? (
            <h2 className="text-lg font-semibold tracking-tight text-white">New projection</h2>
          ) : (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-400/80">
                {scenario!.symbol}
              </p>
              <input
                className="mt-0.5 w-full max-w-md border-0 bg-transparent text-xl font-bold text-white outline-none focus:ring-0"
                value={scenario!.name}
                onChange={(e) => onUpdateScenario(scenario!.id, { name: e.target.value })}
                aria-label="Scenario name"
              />
              {scenario!.companyName ? (
                <p className="text-sm text-white/45">{scenario!.companyName}</p>
              ) : null}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(quote?.symbol || scenario?.symbol) && (
            <button
              type="button"
              className="btn-ghost !py-1.5 !text-xs"
              disabled={refreshing}
              onClick={() => void refreshQuote()}
            >
              {refreshing ? 'Refreshing…' : 'Refresh quote'}
            </button>
          )}
          {isDraft ? (
            <SaveScenarioButton
              quote={draftQuote}
              mcapOverride={draftMcapOverride}
              easyRows={draftEasy}
              advancedRows={draftAdvanced}
              onSave={handleSave}
            />
          ) : (
            <>
              <SaveScenarioButton
                quote={quote}
                mcapOverride={mcapOverride}
                easyRows={easyRows}
                advancedRows={advancedRows}
                buttonLabel="Save as…"
                defaultName={`Copy of ${scenario!.name}`}
                onSave={(input) =>
                  onUpsertScenario({
                    ...input,
                    symbol: scenario!.symbol,
                  })
                }
              />
              {onDelete && (
                <button
                  type="button"
                  className="btn-ghost !text-xs text-white/50 hover:text-red-300"
                  onClick={() => onDelete(scenario!.id)}
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {isDraft ? (
        <TickerSearch
          quote={draftQuote}
          loading={loading}
          error={fetchError}
          onFetch={handleFetch}
        />
      ) : null}

      {refreshError && <p className="text-sm text-red-300">{refreshError}</p>}

      {/* Quote context — always visible to read ROI */}
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyInput
          label="Market cap (override)"
          value={mcapOverride}
          onChange={setMcapOverride}
          currency={currency}
          placeholder="Live or e.g. 3.5T"
          hint={
            mcapOverride != null
              ? `Override · ${formatMoney(mcapOverride, currency)}`
              : liveMcap != null
                ? `Live ${formatMoney(liveMcap, currency)}`
                : 'Enter mcap or fetch ticker'
          }
        />
        <MoneyInput
          label="Share price (override)"
          value={mcapOverride != null ? currentSharePrice : quote?.price ?? null}
          onChange={setSharePriceOverride}
          currency={currency}
          placeholder="Live or e.g. 250"
          disabled={sharesOutstanding == null}
          commitOnBlur
          displayDecimals={4}
          hint={
            sharesOutstanding == null
              ? 'Needs shares (mcap ÷ price)'
              : mcapOverride != null
                ? `→ mcap ${formatMoney(currentMarketCap, currency)}`
                : quote?.price != null
                  ? `Live ${formatPrice(quote.price, currency)}`
                  : 'Price × shares = mcap'
          }
        />
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            Effective mcap
          </div>
          <div className="mt-0.5 text-lg font-semibold tabular-nums text-white">
            {currentMarketCap != null ? formatMoney(currentMarketCap, currency) : '—'}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-white/40">Shares / price</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums text-white">
            {sharesOutstanding != null
              ? sharesOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })
              : '—'}{' '}
            <span className="text-white/40">sh</span>
          </div>
          <div className="text-xs tabular-nums text-white/50">
            {currentSharePrice != null ? formatPrice(currentSharePrice, currency) : '—'}
          </div>
        </div>
      </div>

      {/* Results first */}
      <RoiHero
        hero={hero}
        secondary={secondary}
        selectedBasis={selectedBasis}
        onSelectBasis={setSelectedBasis}
        showBasisTabs
        showEasyTab={easyProjections.length > 0}
        currency={currency}
        currentMarketCap={currentMarketCap}
      />

      {/* Assumptions — collapsed by default on saved scenarios */}
      <div className="space-y-1 border-t border-white/[0.06] pt-2">
        <AssumptionToggle
          title="Easy assumptions"
          open={easyOpen}
          onToggle={() => setEasyOpen((v) => !v)}
          summary={
            easyFilled > 0
              ? `${easyFilled} target${easyFilled === 1 ? '' : 's'}`
              : 'No targets yet'
          }
          tip={
            <InfoTip label="About easy assumptions">
              Enter target years and projected market cap or share price. The other is calculated
              from shares outstanding. ROI uses market cap vs today.
            </InfoTip>
          }
        />
        {easyOpen ? (
          <div className="pb-3 pt-1">
            <EasyInputs
              rows={easyRows}
              onChange={setEasyRows}
              currency={currency}
              currentMarketCap={currentMarketCap}
              sharesOutstanding={sharesOutstanding}
              currentPrice={quote?.price ?? scenario?.currentPrice ?? null}
            />
          </div>
        ) : null}

        <AssumptionToggle
          title="Advanced assumptions"
          open={advancedOpen}
          onToggle={() => setAdvancedOpen((v) => !v)}
          summary={
            advancedRows.length === 0
              ? 'No years'
              : `${advancedRows.length} year${advancedRows.length === 1 ? '' : 's'}${
                  advFilled > 0 ? ` · ${advFilled} with metrics` : ''
                }`
          }
          tip={
            <InfoTip label="About advanced assumptions">
              Per year: fundamentals × multiples for implied mcap. Dilution factor scales
              shareholder ROI (1.0 = none). Leave unused bases blank.
            </InfoTip>
          }
        />
        {advancedOpen ? (
          <div className="pb-1 pt-1">
            <AdvancedInputs
              rows={advancedRows}
              onChange={setAdvancedRows}
              currency={currency}
              sharesOutstanding={sharesOutstanding}
              currentMarketCap={currentMarketCap}
            />
          </div>
        ) : null}
      </div>

      <div
        className={`grid w-full min-w-0 gap-5 border-t border-white/[0.06] pt-4 ${
          hasAdvData ? 'lg:grid-cols-2' : ''
        }`}
      >
        <div className="min-w-0 w-full">
          <h3 className="section-title mb-2">
            Easy
            <span className="ml-2 font-normal text-white/40">· path</span>
          </h3>
          <FullscreenChart title="Easy · path" className="w-full min-w-0">
            <MarketCapChart
              data={easyChart}
              mode="easy"
              currency={currency}
              sharesOutstanding={sharesOutstanding}
            />
          </FullscreenChart>
        </div>
        {hasAdvData && (
          <div className="min-w-0 w-full">
            <h3 className="section-title mb-2">
              Advanced
              <span className="ml-2 font-normal text-white/40">· path</span>
            </h3>
            <FullscreenChart title="Advanced · path" className="w-full min-w-0">
              <MarketCapChart
                data={advancedChart}
                mode="advanced"
                currency={currency}
                sharesOutstanding={sharesOutstanding}
              />
            </FullscreenChart>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.06] pt-4">
        <h3 className="section-title mb-2">Projection table</h3>
        <ProjectionTable
          rows={allProjections}
          currency={currency}
          sharesOutstanding={sharesOutstanding}
        />
      </div>
    </section>
  )
}

function AssumptionToggle({
  title,
  open,
  onToggle,
  summary,
  tip,
}: {
  title: string
  open: boolean
  onToggle: () => void
  summary: string
  tip: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 items-center gap-1.5 text-left"
        aria-expanded={open}
      >
        <span
          className={`inline-flex h-5 w-5 items-center justify-center text-[10px] text-white/45 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
          aria-hidden
        >
          ▸
        </span>
        <span className="section-title">{title}</span>
        {!open ? (
          <span className="text-xs font-normal text-white/40">· {summary}</span>
        ) : null}
      </button>
      {tip}
    </div>
  )
}
