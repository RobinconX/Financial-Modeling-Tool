import { useCallback, useEffect, useState } from 'react'
import { CompanyPanel } from './components/analyzer/CompanyPanel'
import { SavedView } from './components/saved/SavedView'
import { PortfolioView } from './components/portfolio/PortfolioView'
import { useSavedScenarios } from './hooks/useSavedScenarios'
import { useSavedPortfolios } from './hooks/useSavedPortfolios'
import { useAutoQuoteRefresh } from './hooks/useAutoQuoteRefresh'
import { useIncomeCost } from './hooks/useIncomeCost'
import { IncomeCostView } from './components/income-cost/IncomeCostView'
import type { AnalyzerLoadState, AppTab } from './types'

const NAV_COLLAPSED_KEY = 'grok-lab-nav-collapsed'
const APP_TAB_KEY = 'grok-lab-app-tab'

const ALL_TABS: AppTab[] = [
  'analyzer',
  'saved',
  'portfolio',
  'overview',
  'income-cost',
  'pension-funds',
]

function readNavCollapsed(): boolean {
  try {
    return localStorage.getItem(NAV_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function readAppTab(): AppTab {
  try {
    const v = localStorage.getItem(APP_TAB_KEY)
    if (v && (ALL_TABS as string[]).includes(v)) return v as AppTab
  } catch {
    /* ignore */
  }
  return 'analyzer'
}

const NAV_MARKS: Record<AppTab, string> = {
  analyzer: 'A',
  saved: 'S',
  portfolio: 'P',
  overview: 'O',
  'income-cost': 'I',
  'pension-funds': 'F',
}

type NavItem = {
  id: AppTab
  label: string
  count?: number
  countClass?: string
}

type NavSection = {
  id: string
  label: string
  items: NavItem[]
}

const TAB_META: Record<AppTab, { title: string; subtitle: string }> = {
  analyzer: {
    title: 'Analyzer',
    subtitle: 'Look up a ticker, project mcap or share price, and estimate ROI p.a.',
  },
  saved: {
    title: 'Saved projections',
    subtitle: 'Browse and edit named scenarios by ticker with tables and charts.',
  },
  portfolio: {
    title: 'Portfolio',
    subtitle: 'Allocate shares, deposits, and planned buy/sell actions over time.',
  },
  overview: {
    title: 'Overview',
    subtitle: 'High-level household and portfolio summary.',
  },
  'income-cost': {
    title: 'Income / Cost',
    subtitle: 'Income streams and cost positions by year (CHF).',
  },
  'pension-funds': {
    title: 'Pension / Funds',
    subtitle: 'Pension and fund allocations.',
  },
}

function PlaceholderView({ title }: { title: string }) {
  return (
    <div className="card flex min-h-[16rem] flex-col items-center justify-center gap-2 p-10 text-center">
      <p className="text-lg font-semibold text-white/80">{title}</p>
      <p className="text-sm text-white/40">Coming soon — no content yet.</p>
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<AppTab>(readAppTab)
  const [compare, setCompare] = useState(false)
  const [loadA, setLoadA] = useState<AnalyzerLoadState | null>(null)
  const [loadB, setLoadB] = useState<AnalyzerLoadState | null>(null)
  const [navCollapsed, setNavCollapsed] = useState(readNavCollapsed)

  useEffect(() => {
    try {
      localStorage.setItem(NAV_COLLAPSED_KEY, navCollapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [navCollapsed])

  useEffect(() => {
    try {
      localStorage.setItem(APP_TAB_KEY, tab)
    } catch {
      /* ignore */
    }
  }, [tab])

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
    copyPortfolio,
    reorderPortfolios,
  } = useSavedPortfolios()

  // Live quotes for all known tickers — on load + every 5 minutes
  useAutoQuoteRefresh(scenarios, portfolios, updateScenario)

  const {
    scenarios: incomeCostScenarios,
    lines: incomeCostLines,
    error: incomeCostError,
    upsertLine,
    removeLine,
    addLine,
    addScenario,
    renameScenario,
    removeScenario,
    reorderScenariosByIds,
    copyScenario,
  } = useIncomeCost()

  const handleOpenInAnalyzer = useCallback((state: AnalyzerLoadState) => {
    setLoadA(state)
    setTab('analyzer')
  }, [])

  const sections: NavSection[] = [
    {
      id: 'investing',
      label: 'Investing',
      items: [
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
      ],
    },
    {
      id: 'other',
      label: 'Life',
      items: [
        { id: 'overview', label: 'Overview' },
        { id: 'income-cost', label: 'Income / Cost' },
        { id: 'pension-funds', label: 'Pension / Funds' },
      ],
    },
  ]

  function renderNavButton(item: NavItem) {
    const active = tab === item.id
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setTab(item.id)}
        title={item.label}
        className={`flex items-center rounded-lg text-sm font-medium transition ${
          navCollapsed
            ? 'justify-center px-0 py-2.5'
            : 'justify-between px-3 py-2 text-left'
        } ${
          active
            ? 'bg-white text-black shadow'
            : 'text-white/65 hover:bg-white/5 hover:text-white'
        }`}
      >
        {navCollapsed ? (
          <span className="text-xs font-bold">{NAV_MARKS[item.id]}</span>
        ) : (
          <>
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
          </>
        )}
      </button>
    )
  }

  const meta = TAB_META[tab]

  return (
    <div className="flex min-h-screen">
      {/* App sidebar */}
      <aside
        className={`relative flex shrink-0 flex-col border-r border-white/10 bg-black/40 py-5 transition-[width] duration-200 ${
          navCollapsed ? 'w-[52px] px-1.5' : 'w-[220px] px-3'
        }`}
      >
        <div className={`mb-4 ${navCollapsed ? 'px-0 text-center' : 'px-2'}`}>
          {navCollapsed ? (
            <p className="text-xs font-bold text-emerald-400/90" title="Grok Lab · Stock ROI">
              GL
            </p>
          ) : (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-emerald-400/80">
                Grok Lab
              </p>
              <h1 className="mt-1 text-lg font-bold leading-tight tracking-tight text-white">
                Stock ROI
              </h1>
            </>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-4">
          {sections.map((section) => (
            <div key={section.id} className="flex flex-col gap-1">
              {!navCollapsed && (
                <p className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/30">
                  {section.label}
                </p>
              )}
              {navCollapsed && section.id !== sections[0].id && (
                <div className="mx-auto my-1 h-px w-6 bg-white/10" aria-hidden />
              )}
              {section.items.map(renderNavButton)}
            </div>
          ))}
        </nav>

        {!navCollapsed && (
          <p className="mt-4 px-2 text-[10px] leading-relaxed text-white/25">
            Local only · not investment advice
          </p>
        )}

        <button
          type="button"
          onClick={() => setNavCollapsed((c) => !c)}
          title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="group absolute top-0 right-0 z-10 flex h-full w-3 items-center justify-center border-0 bg-transparent p-0 hover:w-4 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500/50"
        >
          <span
            className="pointer-events-none flex h-10 w-3.5 items-center justify-center rounded-l-md border border-r-0 border-white/15 bg-black/50 text-[10px] text-white/45 shadow-sm transition group-hover:border-white/25 group-hover:text-white/80"
            aria-hidden
          >
            {navCollapsed ? '»' : '«'}
          </span>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-white/5 px-6 py-4">
          <h2 className="text-xl font-semibold tracking-tight text-white">{meta.title}</h2>
          <p className="mt-0.5 text-sm text-white/45">{meta.subtitle}</p>
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
              copyPortfolio={copyPortfolio}
              reorderPortfolios={reorderPortfolios}
              incomeCostScenarios={incomeCostScenarios}
              incomeCostLines={incomeCostLines}
            />
          )}

          {tab === 'overview' && <PlaceholderView title="Overview" />}
          {tab === 'income-cost' && (
            <IncomeCostView
              scenarios={incomeCostScenarios}
              lines={incomeCostLines}
              storageError={incomeCostError}
              upsertLine={upsertLine}
              removeLine={removeLine}
              addLine={addLine}
              addScenario={addScenario}
              renameScenario={renameScenario}
              removeScenario={removeScenario}
              reorderScenariosByIds={reorderScenariosByIds}
              copyScenario={copyScenario}
            />
          )}
          {tab === 'pension-funds' && <PlaceholderView title="Pension / Funds" />}
        </main>
      </div>
    </div>
  )
}
