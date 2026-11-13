import { useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { useOverview } from './hooks/useOverview'
import { usePortfolioContributions } from './hooks/usePortfolioContributions'
import { usePortfolioActuals } from './hooks/usePortfolioActuals'
import { usePortfolioSharedCash } from './hooks/usePortfolioSharedCash'
import {
  applyPortfolioActualsModeSetting,
  getPortfolioActualsMode,
  type PortfolioActualsMode,
} from './lib/portfolioActualsMode'
import {
  applyPortfolioCashModeSetting,
  getPortfolioCashMode,
  type PortfolioCashMode,
} from './lib/portfolioCashMode'
import { resolvePortfoliosCash } from './lib/portfolioSharedCash'
import { DataSettingsPanel } from './components/settings/DataSettingsPanel'
import { QuoteLoadingHint } from './components/common/QuoteLoadingHint'
import { QuoteHealthProvider } from './context/QuoteHealthContext'
import { FeatureGuideProvider } from './components/guides/FeatureGuideProvider'
import { FeatureGuideRail } from './components/guides/FeatureGuideRail'
import { GuidesHeaderButton } from './components/guides/GuidesHeaderButton'
import { FeedbackHeaderButton } from './components/feedback/FeedbackHeaderButton'
import { FeedbackDialog } from './components/feedback/FeedbackDialog'
import { ReleaseLogDialog } from './components/release-log/ReleaseLogDialog'
import { LinkedFileSaveHint } from './components/settings/LinkedFileSaveHint'
import { StorageRecoveryBanner } from './components/common/StorageRecoveryBanner'
import { getAccountHint } from './lib/accountCatalog'
import { writeActualsFocus } from './lib/actualsFocus'
import type { ActualsRepairTarget } from './lib/history'
import { filterStorageRecoveryNoticesForTab } from './lib/storageRecoveryTab'
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

function NavGlyph({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  )
}

const NAV_ICONS: Record<AppTab, ReactNode> = {
  overview: (
    <NavGlyph>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </NavGlyph>
  ),
  'income-cost': (
    <NavGlyph>
      <path d="M7 4v16" />
      <path d="M3 8l4-4 4 4" />
      <path d="M17 20V4" />
      <path d="M13 16l4 4 4-4" />
    </NavGlyph>
  ),
  savings: (
    <NavGlyph>
      <path d="M4 21h16" />
      <path d="M6 21V10l6-5 6 5v11" />
      <path d="M10 21v-6h4v6" />
    </NavGlyph>
  ),
  history: (
    <NavGlyph>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l4 2" />
    </NavGlyph>
  ),
  projections: (
    <NavGlyph>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </NavGlyph>
  ),
  portfolio: (
    <NavGlyph>
      <rect x="3" y="12" width="5" height="8" rx="0.5" />
      <rect x="10" y="5" width="5" height="15" rx="0.5" />
      <rect x="17" y="9" width="5" height="11" rx="0.5" />
    </NavGlyph>
  ),
  settings: (
    <NavGlyph>
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </NavGlyph>
  ),
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
      'Analyze a ticker or rank saved projections — Easy + Advanced assumptions, CAGR, and comparables.',
  },
  portfolio: {
    title: 'Portfolio',
    subtitle: 'Allocate shares, deposits, and planned buy/sell actions over time.',
  },
  overview: {
    title: 'Overview',
    subtitle: 'Stacked net worth by year (CHF) from portfolios, savings, and other assets.',
  },
  history: {
    title: 'History',
    subtitle: 'Recorded actuals over time — portfolios and savings, monthly or year-end.',
  },
  'income-cost': {
    title: 'Budget',
    subtitle: 'Income streams and cost positions by year (CHF).',
  },
  savings: {
    title: 'Savings',
    subtitle: 'Balances, contributions, and compound projections (CHF).',
  },
  settings: {
    title: 'Settings',
    subtitle: 'Data file, backups, export — and portfolio modeling preferences.',
  },
}

export default function App() {
  const [tab, setTab] = useState<AppTab>(readAppTab)
  const [navCollapsed, setNavCollapsed] = useState(readNavCollapsed)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [releaseLogOpen, setReleaseLogOpen] = useState(false)

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
    storageRecovery: projectionsStorageRecovery,
    dismissStorageRecovery: dismissProjectionsStorageRecovery,
    upsertScenario,
    updateScenario,
    deleteScenario,
    importScenarios,
  } = useSavedScenarios()

  const {
    portfolios,
    error: portfolioError,
    storageRecovery: portfolioStorageRecovery,
    dismissStorageRecovery: dismissPortfolioStorageRecovery,
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
    copyPortfolio,
    reorderPortfolios,
    replacePortfolios,
  } = useSavedPortfolios()

  // Refresh saved scenario/portfolio quotes on every tab (data is global in localStorage).
  const {
    quotesLoading,
    quoteCount,
    missingSymbols,
    quoteRefreshError,
    quoteLastSuccessAt,
    quoteRefreshFailureDismissed,
    dismissQuoteRefreshFailure,
  } = useAutoQuoteRefresh(
    scenarios,
    portfolios,
    updateScenario,
    updatePortfolio,
    true,
  )

  const {
    scenarios: incomeCostScenarios,
    lines: incomeCostLines,
    draws: incomeCostDraws,
    error: incomeCostError,
    storageRecovery: incomeCostStorageRecovery,
    dismissStorageRecovery: dismissIncomeCostStorageRecovery,
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

  const savings = useSavings()
  const savingsAccounts = savings.accounts
  const overview = useOverview()
  const portfolioContributions = usePortfolioContributions()
  const portfolioActuals = usePortfolioActuals()
  const {
    storageRecovery: portfolioActualsStorageRecovery,
    dismissStorageRecovery: dismissPortfolioActualsStorageRecovery,
  } = portfolioActuals
  const portfolioSharedCash = usePortfolioSharedCash()
  const [portfolioCashMode, setPortfolioCashMode] =
    useState<PortfolioCashMode>(getPortfolioCashMode)
  const [portfolioActualsMode, setPortfolioActualsMode] = useState<PortfolioActualsMode>(
    getPortfolioActualsMode,
  )

  const portfoliosForCash = useMemo(
    () =>
      resolvePortfoliosCash(
        portfolios,
        portfolioCashMode,
        portfolioSharedCash.sharedCash,
      ),
    [portfolios, portfolioCashMode, portfolioSharedCash.sharedCash],
  )

  function setPortfolioCashModeAndPersist(mode: PortfolioCashMode) {
    applyPortfolioCashModeSetting(mode)
    setPortfolioCashMode(mode)
  }

  function setPortfolioActualsModeAndPersist(mode: PortfolioActualsMode) {
    applyPortfolioActualsModeSetting(mode)
    setPortfolioActualsMode(mode)
  }

  const {
    comparables,
    error: comparablesError,
    storageRecovery: comparablesStorageRecovery,
    dismissStorageRecovery: dismissComparablesStorageRecovery,
    createComparable,
    updateComparable,
    deleteComparable,
  } = useComparables()

  const {
    storageRecovery: savingsStorageRecovery,
    dismissStorageRecovery: dismissSavingsStorageRecovery,
  } = savings
  const {
    storageRecovery: overviewStorageRecovery,
    dismissStorageRecovery: dismissOverviewStorageRecovery,
  } = overview

  const storageRecoveryNotices = useMemo(() => {
    const list = [
      projectionsStorageRecovery,
      portfolioStorageRecovery,
      incomeCostStorageRecovery,
      portfolioActualsStorageRecovery,
      savingsStorageRecovery,
      overviewStorageRecovery,
      comparablesStorageRecovery,
    ].filter((n): n is NonNullable<typeof n> => n != null)
    return filterStorageRecoveryNoticesForTab(tab, list)
  }, [
    tab,
    projectionsStorageRecovery,
    portfolioStorageRecovery,
    incomeCostStorageRecovery,
    portfolioActualsStorageRecovery,
    savingsStorageRecovery,
    overviewStorageRecovery,
    comparablesStorageRecovery,
  ])

  const dismissStorageRecovery = (storageKey: string) => {
    if (projectionsStorageRecovery?.storageKey === storageKey) {
      dismissProjectionsStorageRecovery()
    }
    if (portfolioStorageRecovery?.storageKey === storageKey) {
      dismissPortfolioStorageRecovery()
    }
    if (incomeCostStorageRecovery?.storageKey === storageKey) {
      dismissIncomeCostStorageRecovery()
    }
    if (portfolioActualsStorageRecovery?.storageKey === storageKey) {
      dismissPortfolioActualsStorageRecovery()
    }
    if (savingsStorageRecovery?.storageKey === storageKey) {
      dismissSavingsStorageRecovery()
    }
    if (overviewStorageRecovery?.storageKey === storageKey) {
      dismissOverviewStorageRecovery()
    }
    if (comparablesStorageRecovery?.storageKey === storageKey) {
      dismissComparablesStorageRecovery()
    }
  }

  const sections: NavSection[] = [
    {
      id: 'other',
      label: 'Life',
      items: [
        { id: 'overview', label: 'Overview' },
        { id: 'income-cost', label: 'Budget' },
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
      items: [{ id: 'settings', label: 'Settings' }],
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
          <span className="flex h-5 w-5 items-center justify-center">{NAV_ICONS[item.id]}</span>
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-2">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center opacity-80">
                {NAV_ICONS[item.id]}
              </span>
              <span className="truncate">{item.label}</span>
            </span>
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
  const accountHint = getAccountHint()

  const openActualsRepair = (repair: ActualsRepairTarget) => {
    writeActualsFocus({
      tab: repair.tab,
      savingsAccountId: repair.savingsAccountId,
      periodKey: repair.periodKey,
    })
    setTab(repair.tab)
  }

  return (
    <FeatureGuideProvider navigateTab={setTab}>
    <QuoteHealthProvider missingSymbols={missingSymbols}>
    <div className="flex h-full min-h-0 overflow-hidden">
      <QuoteLoadingHint
        loading={quotesLoading}
        count={quoteCount}
        failureMessage={quoteRefreshError}
        lastSuccessAt={quoteLastSuccessAt}
        failureDismissed={quoteRefreshFailureDismissed}
        onDismissFailure={dismissQuoteRefreshFailure}
      />
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
              title={
                accountHint
                  ? `Financial Modeling Tool — ${accountHint.name}`
                  : 'Financial Modeling Tool'
              }
            >
              FM
            </p>
          ) : (
            <div>
              <h1 className="text-base font-bold leading-snug tracking-tight text-emerald-400/90">
                Financial Modeling Tool
              </h1>
              {accountHint ? (
                <button
                  type="button"
                  className="mt-0.5 block max-w-full truncate text-left text-[11px] text-white/45 hover:text-white/75"
                  title="Open Settings to switch accounts"
                  onClick={() => setTab('settings')}
                >
                  {accountHint.name}
                </button>
              ) : null}
            </div>
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

        <div className={`mt-auto pt-2 ${navCollapsed ? 'flex justify-center' : 'px-1'}`}>
          <button
            type="button"
            title="Release log"
            className={`text-[10px] text-white/30 transition hover:text-white/55 ${
              navCollapsed ? 'px-1 py-1' : 'px-2 py-1'
            }`}
            onClick={() => setReleaseLogOpen(true)}
          >
            {navCollapsed ? 'Log' : 'Release log'}
          </button>
        </div>

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

      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex shrink-0 items-start justify-between gap-4 border-b border-white/5 bg-[#0b0f14]/90 px-6 py-4 backdrop-blur-sm">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-white">{meta.title}</h2>
              <p className="mt-0.5 text-sm text-white/45">{meta.subtitle}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-1">
              <FeedbackHeaderButton onClick={() => setFeedbackOpen(true)} />
              <GuidesHeaderButton />
              <LinkedFileSaveHint onOpenDataSettings={() => setTab('settings')} />
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-auto px-6 py-6">
            <StorageRecoveryBanner
              notices={storageRecoveryNotices}
              onDismiss={dismissStorageRecovery}
              onOpenDataSettings={() => setTab('settings')}
            />
            {tab === 'projections' && (
              <ProjectionsView
                scenarios={scenarios}
                portfolios={portfolios}
                storageError={storageError}
                upsertScenario={upsertScenario}
                updateScenario={updateScenario}
                deleteScenario={deleteScenario}
                importScenarios={importScenarios}
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
                portfoliosForCash={portfoliosForCash}
                storageError={portfolioError}
                createPortfolio={createPortfolio}
                updatePortfolio={updatePortfolio}
                deletePortfolio={deletePortfolio}
                copyPortfolio={copyPortfolio}
                reorderPortfolios={reorderPortfolios}
                incomeCostLines={incomeCostLines}
                incomeCostScenarios={incomeCostScenarios}
                contributions={portfolioContributions.contributions}
                contributionsError={portfolioContributions.error}
                setContributionYear={portfolioContributions.setYear}
                setContributionsCurrency={portfolioContributions.setCurrency}
                portfolioActuals={portfolioActuals.actuals}
                actualsError={portfolioActuals.error}
                setPortfolioActuals={portfolioActuals.replace}
                portfolioCashMode={portfolioCashMode}
                sharedCash={portfolioSharedCash.sharedCash}
                sharedCashError={portfolioSharedCash.error}
                onSharedCashPatch={portfolioSharedCash.updateFromPortfolioPatch}
                portfolioActualsMode={portfolioActualsMode}
              />
            )}

            {tab === 'overview' && (
              <OverviewView
                overview={overview}
                portfolios={portfoliosForCash}
                stockScenarios={scenarios}
                savingsAccounts={savingsAccounts}
                incomeCostLines={incomeCostLines}
                incomeCostScenarios={incomeCostScenarios}
                portfolioActuals={portfolioActuals.actuals}
                portfolioActualsMode={portfolioActualsMode}
                onRepairActuals={openActualsRepair}
              />
            )}

            {tab === 'history' && (
              <HistoryView
                portfolios={portfoliosForCash}
                savingsAccounts={savingsAccounts}
                portfolioActuals={portfolioActuals.actuals}
                portfolioActualsMode={portfolioActualsMode}
              />
            )}

            {tab === 'income-cost' && (
              <IncomeCostView
                scenarios={incomeCostScenarios}
                lines={incomeCostLines}
                draws={incomeCostDraws}
                savingsAccounts={savingsAccounts}
                portfolios={portfoliosForCash}
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
                onRepairActuals={openActualsRepair}
              />
            )}

            {tab === 'savings' && <SavingsView {...savings} />}

            {tab === 'settings' && (
              <DataSettingsPanel
                portfolios={portfolios}
                replacePortfolios={replacePortfolios}
                portfolioCashMode={portfolioCashMode}
                onPortfolioCashModeChange={setPortfolioCashModeAndPersist}
                sharedCash={portfolioSharedCash.sharedCash}
                replaceSharedCash={portfolioSharedCash.replace}
                portfolioActualsMode={portfolioActualsMode}
                onPortfolioActualsModeChange={setPortfolioActualsModeAndPersist}
                portfolioActuals={portfolioActuals.actuals}
                replacePortfolioActuals={portfolioActuals.replace}
                portfolioContributions={portfolioContributions.contributions}
                replacePortfolioContributions={portfolioContributions.replace}
              />
            )}
          </main>
        </div>
        <FeatureGuideRail />
      </div>
      {feedbackOpen ? <FeedbackDialog tab={tab} onClose={() => setFeedbackOpen(false)} /> : null}
      {releaseLogOpen ? <ReleaseLogDialog onClose={() => setReleaseLogOpen(false)} /> : null}
    </div>
    </QuoteHealthProvider>
    </FeatureGuideProvider>
  )
}
