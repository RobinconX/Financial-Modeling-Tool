import { useCallback, useState } from 'react'
import { CompanyPanel } from './components/CompanyPanel'
import { SavedView } from './components/SavedView'
import { PortfolioView } from './components/PortfolioView'
import { useSavedScenarios } from './hooks/useSavedScenarios'
import { useSavedPortfolios } from './hooks/useSavedPortfolios'
import type { AnalyzerLoadState, AppTab } from './types'

export default function App() {
  const [tab, setTab] = useState<AppTab>('analyzer')
  const [compare, setCompare] = useState(false)
  const [loadA, setLoadA] = useState<AnalyzerLoadState | null>(null)
  const [loadB, setLoadB] = useState<AnalyzerLoadState | null>(null)

  const {
    scenarios,
    grouped,
    error: storageError,
    upsertScenario,
    updateScenario,
    deleteScenario,
  } = useSavedScenarios()

  const {
    portfolios,
    error: portfolioError,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
  } = useSavedPortfolios()

  const handleOpenInAnalyzer = useCallback((state: AnalyzerLoadState) => {
    setLoadA(state)
    setTab('analyzer')
  }, [])

  const navItems: { id: AppTab; label: string; count?: number; countClass?: string }[] = [
    { id: 'analyzer', label: 'Analyzer' },
    {
      id: 'saved',
      label: 'Saved projections',
      count: scenarios.length || undefined,
      countClass: 'bg-emerald-500/20 text-emerald-300',
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      count: portfolios.length || undefined,
      countClass: 'bg-sky-500/20 text-sky-300',
    },
  ]

  return (
    <div className="flex min-h-screen">
      {/* App sidebar */}
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-white/10 bg-black/40 px-3 py-5">
        <div className="mb-6 px-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-400/80">
            Grok Lab
          </p>
          <h1 className="mt-1 text-lg font-bold leading-tight tracking-tight text-white">
            Stock ROI
          </h1>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const active = tab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                  active
                    ? 'bg-white text-black shadow'
                    : 'text-white/65 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{item.label}</span>
                {item.count != null && item.count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      active ? 'bg-black/10 text-black/70' : item.countClass
                    }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <p className="mt-4 px-2 text-[10px] leading-relaxed text-white/25">
          Local only · not investment advice
        </p>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/5 px-6 py-4">
          <h2 className="text-xl font-semibold tracking-tight text-white">
            {tab === 'analyzer' && 'Analyzer'}
            {tab === 'saved' && 'Saved projections'}
            {tab === 'portfolio' && 'Portfolio'}
          </h2>
          <p className="mt-0.5 text-sm text-white/45">
            {tab === 'analyzer' &&
              'Look up a ticker, project mcap or share price, and estimate ROI p.a.'}
            {tab === 'saved' &&
              'Browse and edit named scenarios by ticker with tables and charts.'}
            {tab === 'portfolio' &&
              'Allocate shares, deposits, and planned buy/sell actions over time.'}
          </p>
        </header>

        <main className="flex-1 overflow-auto px-6 py-6">
          {tab === 'analyzer' && (
            <>
              <div className="mb-6 flex justify-end">
                <div className="inline-flex rounded-xl border border-white/10 bg-black/30 p-1">
                  <button
                    type="button"
                    onClick={() => setCompare(false)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      !compare ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    1 company
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompare(true)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      compare ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Compare
                  </button>
                </div>
              </div>

              <div className={`grid gap-6 ${compare ? 'xl:grid-cols-2' : 'max-w-4xl'}`}>
                <CompanyPanel
                  title={compare ? 'Company A' : 'Company'}
                  onSaveScenario={upsertScenario}
                  loadState={loadA}
                  onLoadConsumed={() => setLoadA(null)}
                />
                {compare && (
                  <CompanyPanel
                    title="Company B"
                    onSaveScenario={upsertScenario}
                    loadState={loadB}
                    onLoadConsumed={() => setLoadB(null)}
                  />
                )}
              </div>
            </>
          )}

          {tab === 'saved' && (
            <SavedView
              scenarios={scenarios}
              grouped={grouped}
              storageError={storageError}
              updateScenario={updateScenario}
              deleteScenario={deleteScenario}
              onOpenInAnalyzer={handleOpenInAnalyzer}
            />
          )}

          {tab === 'portfolio' && (
            <PortfolioView
              scenarios={scenarios}
              portfolios={portfolios}
              storageError={portfolioError}
              createPortfolio={createPortfolio}
              updatePortfolio={updatePortfolio}
              deletePortfolio={deletePortfolio}
            />
          )}
        </main>
      </div>
    </div>
  )
}
