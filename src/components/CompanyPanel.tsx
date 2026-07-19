import { useEffect, useMemo, useState } from 'react'
import type {
  AnalysisMode,
  AnalyzerLoadState,
  EasyProjection,
  Quote,
  SavedScenario,
  ValuationBasis,
  YearProjection,
} from '../types'
import { fetchQuoteClient } from '../lib/quote'
import {
  buildAdvancedProjections,
  buildChartSeries,
  buildEasyProjections,
  newEasyProjection,
  newYearProjection,
  pickHeroRow,
} from '../lib/valuation'
import { formatMoney, formatPrice } from '../lib/format'
import {
  impliedSharePrice,
  marketCapFromSharePrice,
  resolveSharesOutstanding,
} from '../lib/sharePrice'
import { TickerSearch } from './TickerSearch'
import { ModeToggle } from './ModeToggle'
import { EasyInputs } from './EasyInputs'
import { AdvancedInputs } from './AdvancedInputs'
import { RoiHero } from './RoiHero'
import { MarketCapChart } from './MarketCapChart'
import { ProjectionTable } from './ProjectionTable'
import { MoneyInput } from './MoneyInput'
import { SaveScenarioButton } from './SaveScenarioButton'

type SaveInput = Omit<SavedScenario, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }

type Props = {
  title: string
  onSaveScenario: (
    input: SaveInput,
  ) => { scenario: SavedScenario; overwritten: boolean } | { error: string }
  loadState?: AnalyzerLoadState | null
  onLoadConsumed?: () => void
}

export function CompanyPanel({ title, onSaveScenario, loadState, onLoadConsumed }: Props) {
  const currentYear = new Date().getFullYear()

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mcapOverride, setMcapOverride] = useState<number | null>(null)

  const [mode, setMode] = useState<AnalysisMode>('easy')
  const [easyRows, setEasyRows] = useState<EasyProjection[]>([newEasyProjection()])
  const [advancedRows, setAdvancedRows] = useState<YearProjection[]>([newYearProjection()])
  const [selectedBasis, setSelectedBasis] = useState<ValuationBasis>('ps')

  // Load scenario from Saved tab (consume once)
  useEffect(() => {
    if (!loadState) return
    setQuote({
      symbol: loadState.symbol,
      name: loadState.companyName ?? loadState.symbol,
      price: loadState.currentPrice ?? 0,
      currency: loadState.currency,
      marketCap: loadState.currentMarketCap,
      sharesOutstanding: loadState.sharesOutstanding,
    })
    setMcapOverride(loadState.mcapOverride)
    setEasyRows(
      loadState.easyRows.length ? loadState.easyRows : [newEasyProjection()],
    )
    setAdvancedRows(
      loadState.advancedRows.length ? loadState.advancedRows : [newYearProjection()],
    )
    setError(null)
    onLoadConsumed?.()
    // Intentionally only when loadState identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState])

  const currency = quote?.currency ?? 'USD'
  const sharesOutstanding = resolveSharesOutstanding({
    sharesOutstanding: quote?.sharesOutstanding,
    marketCap: quote?.marketCap,
    price: quote?.price,
    mcapOverride,
  })
  const currentMarketCap = mcapOverride ?? quote?.marketCap ?? null
  const currentSharePrice =
    impliedSharePrice(currentMarketCap, sharesOutstanding) ??
    (quote?.price != null && quote.price > 0 ? quote.price : null)

  function setSharePriceOverride(sharePrice: number | null) {
    if (sharePrice == null) {
      setMcapOverride(null)
      return
    }
    const mcap = marketCapFromSharePrice(sharePrice, sharesOutstanding)
    if (mcap != null) setMcapOverride(mcap)
  }

  async function handleFetch(symbol: string) {
    const prevSymbol = quote?.symbol?.toUpperCase() ?? null
    setLoading(true)
    setError(null)
    try {
      const q = await fetchQuoteClient(symbol)
      setQuote(q)
      setMcapOverride(null)
      // New ticker → wipe Easy/Advanced assumptions so they don't carry over
      if (prevSymbol !== q.symbol.toUpperCase()) {
        setEasyRows([newEasyProjection()])
        setAdvancedRows([newYearProjection()])
        setSelectedBasis('ps')
      }
    } catch (err) {
      setQuote(null)
      setError(err instanceof Error ? err.message : 'Failed to fetch quote')
    } finally {
      setLoading(false)
    }
  }

  const projectionRows = useMemo(() => {
    if (currentMarketCap == null || currentMarketCap <= 0) return []
    if (mode === 'easy') {
      return buildEasyProjections(currentMarketCap, easyRows, currentYear)
    }
    return buildAdvancedProjections(currentMarketCap, advancedRows, currentYear)
  }, [currentMarketCap, mode, easyRows, advancedRows, currentYear])

  const chartData = useMemo(() => {
    if (currentMarketCap == null || currentMarketCap <= 0) return []
    return buildChartSeries(currentMarketCap, mode, easyRows, advancedRows, currentYear)
  }, [currentMarketCap, mode, easyRows, advancedRows, currentYear])

  const heroBasis: ValuationBasis | 'easy' = mode === 'easy' ? 'easy' : selectedBasis
  const hero = pickHeroRow(projectionRows, heroBasis)

  const secondary =
    mode === 'advanced'
      ? (['ps', 'pfcf', 'pe'] as ValuationBasis[])
          .filter((b) => b !== selectedBasis)
          .map((b) => pickHeroRow(projectionRows, b))
          .filter((r): r is NonNullable<typeof r> => r != null)
      : mode === 'easy' && hero
        ? projectionRows
            .filter((r) => r.basis === 'easy' && r.year !== hero.year)
            .sort((a, b) => a.year - b.year)
        : []

  return (
    <section className="card flex flex-col gap-5 p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-white">{title}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <SaveScenarioButton
            quote={quote}
            mcapOverride={mcapOverride}
            easyRows={easyRows}
            advancedRows={advancedRows}
            onSave={onSaveScenario}
          />
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </header>

      <TickerSearch quote={quote} loading={loading} error={error} onFetch={handleFetch} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyInput
          label="Market cap (override)"
          value={mcapOverride}
          onChange={setMcapOverride}
          currency={currency}
          placeholder="Live or e.g. 3.5T"
          hint={
            mcapOverride != null
              ? `Override · ${formatMoney(mcapOverride, currency)}`
              : quote?.marketCap != null
                ? `Live ${formatMoney(quote.marketCap, currency)} — edit to override`
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
              ? 'Needs shares (mcap ÷ price) to convert'
              : mcapOverride != null
                ? `→ mcap ${formatMoney(currentMarketCap, currency)}`
                : quote?.price != null
                  ? `Live ${formatPrice(quote.price, currency)} — edit to set mcap override`
                  : 'Price × shares = mcap'
          }
        />
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            Effective current mcap
          </div>
          <div className="text-lg font-semibold tabular-nums text-white">
            {currentMarketCap != null ? formatMoney(currentMarketCap, currency) : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-white/40">
            Shares / price
          </div>
          <div className="text-sm font-semibold tabular-nums text-white">
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

      <RoiHero
        hero={hero}
        secondary={secondary}
        selectedBasis={heroBasis}
        onSelectBasis={(b) => {
          if (b !== 'easy') setSelectedBasis(b)
        }}
        showBasisTabs={mode === 'advanced'}
        currency={currency}
        currentMarketCap={currentMarketCap}
      />

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
          Assumptions
        </h3>
        {mode === 'easy' ? (
          <EasyInputs
            rows={easyRows}
            onChange={setEasyRows}
            currency={currency}
            currentMarketCap={currentMarketCap}
            sharesOutstanding={sharesOutstanding}
            currentPrice={quote?.price ?? null}
          />
        ) : (
          <AdvancedInputs
            rows={advancedRows}
            onChange={setAdvancedRows}
            currency={currency}
            sharesOutstanding={sharesOutstanding}
          />
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
          Market cap evolution
        </h3>
        <MarketCapChart data={chartData} mode={mode} currency={currency} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
          Projection table
        </h3>
        <ProjectionTable
          rows={projectionRows}
          currency={currency}
          sharesOutstanding={sharesOutstanding}
        />
      </div>
    </section>
  )
}
