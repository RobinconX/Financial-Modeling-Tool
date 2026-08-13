import { useEffect, useState } from 'react'
import { ProjectionsView } from './components/projections/ProjectionsView'
import { PortfolioView } from './components/portfolio/PortfolioView'
import { useSavedScenarios } from './hooks/useSavedScenarios'
import { useSavedPortfolios } from './hooks/useSavedPortfolios'
import { useComparables } from './hooks/useComparables'
import { useAutoQuoteRefresh } from './hooks/useAutoQuoteRefresh'
import { useIncomeCost } from './hooks/useIncomeCost'
import { IncomeCostView } from './components/income-cost/IncomeCostView'
import { SavingsView } from './components/savings/SavingsView'
import { OverviewView } from './components/overview/OverviewView'
import { HistoryView } from './components/history/HistoryView'
import { useSavings } from './hooks/useSavings'
import { DataSettingsPanel } from './components/settings/DataSettingsPanel'
import { QuoteLoadingHint } from './components/common/QuoteLoadingHint'
import { LinkedFileSaveHint } from './components/settings/LinkedFileSaveHint'
import type { AppTab } from './types'

const NAV_COLLAPSED_KEY = 'grok-lab-nav-collapsed'
const APP_TAB_KEY = 'grok-lab-app-tab'

const ALL_TABS: AppTab[] = [
  'projections',
  'portfolio',
  'overview',
  'history',
  'income-cost',
  'savings',
  'settings',
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
    // Migrate renamed tab ids
    if (v === 'pension-funds') return 'savings'
    if (v === 'analyzer' || v === 'saved') return 'projections'
    if (v && (ALL_TABS as string[]).includes(v)) return v as AppTab
  } catch {
    /* ignore */
  }
  return 'projections'
}

const NAV_MARKS: Record<AppTab, string> = {
  projections: 'P',
  portfolio: 'F',
  overview: 'O',
  history: 'H',
  'income-cost': 'I',
  savings: 'V',
  settings: '⚙',
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
  projections: {
    title: 'Projections',
    subtitle:
      'Analyze a ticker or rank saved projections — Easy + Advanced assumptions, ROI, and comparables.',
  },
  portfolio: {
    title: 'Portfolio',
    subtitle: 'Allocate shares, deposits, and planned buy/sell actions over time.',
  },
  overview: {
    title: 'Overview',
    subtitle: 'Stacked net worth by year (CHF) from portfolios, savings, and manual assets.',
  },
  history: {
    title: 'History',
    subtitle: 'Recorded actuals over time — portfolios and savings, monthly or year-end.',
  },
  'income-cost': {
    title: 'Income / Cost',
    subtitle: 'Income streams and cost positions by year (CHF).',
  },
  savings: {
    title: 'Savings',
    subtitle: 'Balances, contributions, and compound projections (CHF).',
  },
  settings: {
    title: 'Data & backup',
    subtitle: 'Link a data file, export/import JSON — your data stays on this device.',
  },
}

export default function App() {
  const [tab, setTab] = useState<AppTab>(readAppTab)
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
  const { quotesLoading, quoteCount } = useAutoQuoteRefresh(
    scenarios,
    portfolios,
    updateScenario,
  )

  const {
    scenarios: incomeCostScenarios,
    lines: incomeCostLines,
    draws: incomeCostDraws,
    error: incomeCostError,
    upsertLine,
    removeLine,
    addLine,
    upsertDraw,
    removeDraw,
    addDraw,
    addScenario,
    renameScenario,
    setScenarioYear,
    removeScenario,
    reorderScenariosByIds,
    copyScenario,
  } = useIncomeCost()

  const { accounts: savingsAccounts } = useSavings()
  // savingsAccounts always includes permanent Cash (ensured on load)

  const {
    comparables,
    error: comparablesError,
    createComparable,
    updateComparable,
    deleteComparable,
  } = useComparables()

  const sections: NavSection[] = [
    {
      id: 'other',
      label: 'Life',
      items: [
        { id: 'overview', label: 'Overview' },
        { id: 'income-cost', label: 'Income / Cost' },
        { id: 'savings', label: 'Savings' },
        { id: 'history', label: 'History' },
      ],
    },
    {
      id: 'investing',
      label: 'Investing',
      items: [
        {
          id: 'projections',
          label: 'Projections',
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
      id: 'system',
      label: 'System',
      items: [{ id: 'settings', label: 'Data & backup' }],
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
    <div className="flex h-screen overflow-hidden">
      <QuoteLoadingHint loading={quotesLoading} count={quoteCount} />
      {/* App sidebar */}
      <aside
        className={`relative flex h-full min-h-0 shrink-0 flex-col border-r border-white/10 bg-black/40 py-5 transition-[width] duration-200 ${
          navCollapsed ? 'w-[52px] px-1.5' : 'w-[220px] px-3'
        }`}
      >
        <div className={`mb-4 ${navCollapsed ? 'px-0 text-center' : 'px-2'}`}>
          {navCollapsed ? (
            <p
              className="text-xs font-bold text-emerald-400/90"
              title="Financial Modeling Tool"
            >
              FM
            </p>
          ) : (
            <h1 className="text-base font-bold leading-snug tracking-tight text-emerald-400/90">
              Financial Modeling Tool
            </h1>
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex shrink-0 items-start justify-between gap-4 border-b border-white/5 bg-[#0b0f14]/90 px-6 py-4 backdrop-blur-sm">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight text-white">{meta.title}</h2>
            <p className="mt-0.5 text-sm text-white/45">{meta.subtitle}</p>
          </div>
          <div className="shrink-0 pt-1">
            <LinkedFileSaveHint />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-6 py-6">
          {tab === 'projections' && (
            <ProjectionsView
              scenarios={scenarios}
              portfolios={portfolios}
              storageError={storageError}
              upsertScenario={upsertScenario}
              updateScenario={updateScenario}
              deleteScenario={deleteScenario}
              comparables={comparables}
              comparablesError={comparablesError}
              createComparable={createComparable}
              updateComparable={updateComparable}
              deleteComparable={deleteComparable}
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
              incomeCostLines={incomeCostLines}
              incomeCostScenarios={incomeCostScenarios}
            />
          )}

          {tab === 'overview' && (
            <OverviewView
              portfolios={portfolios}
              stockScenarios={scenarios}
              savingsAccounts={savingsAccounts}
              incomeCostLines={incomeCostLines}
              incomeCostScenarios={incomeCostScenarios}
            />
          )}

          {tab === 'history' && (
            <HistoryView portfolios={portfolios} savingsAccounts={savingsAccounts} />
          )}

          {tab === 'income-cost' && (
            <IncomeCostView
              scenarios={incomeCostScenarios}
              lines={incomeCostLines}
              draws={incomeCostDraws}
              savingsAccounts={savingsAccounts}
              storageError={incomeCostError}
              upsertLine={upsertLine}
              removeLine={removeLine}
              addLine={addLine}
              upsertDraw={upsertDraw}
              removeDraw={removeDraw}
              addDraw={addDraw}
              addScenario={addScenario}
              renameScenario={renameScenario}
              setScenarioYear={setScenarioYear}
              removeScenario={removeScenario}
              reorderScenariosByIds={reorderScenariosByIds}
              copyScenario={copyScenario}
            />
          )}

          {tab === 'savings' && <SavingsView />}

          {tab === 'settings' && <DataSettingsPanel />}
        </main>
      </div>
    </div>
  )
}
