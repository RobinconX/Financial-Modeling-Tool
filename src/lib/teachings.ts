import type { AppTab } from '../types'

export type FeatureGuideId = string

export type GuideLocation = {
  tab: AppTab
  /** Sub-view when the tab has modes/panels, e.g. 'comps' | 'analyze' | 'chart' | 'monthly' */
  view?: string
  /** Matches data-guide-anchor on the target section */
  anchor: string
}

/**
 * Illustration or other media for a guide body.
 * `src` may be a shipped asset (`/guides/...`), an absolute https URL, or a future API URL.
 * In markdown, reference with `![alt](ref:<id>)` or paste `src` directly.
 */
export type GuideReference = {
  id: string
  src: string
  alt: string
  caption?: string
}

export type FeatureGuide = {
  id: FeatureGuideId
  title: string
  /** Short blurb; may later mirror/replace InfoTip bodies. */
  summary: string
  /** Markdown: how it works, how to interpret, one toy numeric example. */
  body: string
  /** Optional figures / media; selective — only when a guide needs them. */
  references?: GuideReference[]
  /** Optional deeper-reading link; omitted until a hosted chapter exists. */
  bookUrl?: string
  status: 'ready' | 'draft'
  location: GuideLocation
  /** null = top-level under its tab group */
  parentId: string | null
  order: number
}

export type GuideTreeNode = {
  guide: FeatureGuide
  children: GuideTreeNode[]
}

export type GuideTabGroup = {
  tab: AppTab
  label: string
  roots: GuideTreeNode[]
}

export type GuideSidebarSection = {
  id: string
  label: string
  tabs: GuideTabGroup[]
}

const TAB_LABELS: Record<AppTab, string> = {
  projections: 'Projections',
  portfolio: 'Portfolio',
  overview: 'Overview',
  history: 'History',
  'income-cost': 'Budget',
  savings: 'Savings',
  settings: 'Data & backup',
}

const DRAFT_BODY = `## Guide

The longer how-it-works guide for this feature will be added here later. The short description above is the working summary for now.`

function draft(
  id: FeatureGuideId,
  title: string,
  summary: string,
  location: GuideLocation,
  parentId: string | null,
  order: number,
): FeatureGuide {
  return {
    id,
    title,
    summary,
    body: DRAFT_BODY,
    status: 'draft',
    location,
    parentId,
    order,
  }
}

const GUIDES: Record<string, FeatureGuide> = {
  overview: draft(
    'overview',
    'Overview',
    'Builds a year-by-year net-worth picture in CHF by stacking portfolios, savings, and other asset series you define. Use it to compare scenarios, see how the stack evolves, and optionally explore runway drawdowns.',
    { tab: 'overview', anchor: 'overview' },
    null,
    0,
  ),
  'overview.scenarios': draft(
    'overview.scenarios',
    'Scenarios',
    'Each scenario is a named net-worth stack: which portfolios, savings accounts, and manual series to include, plus optional notes. Add, rename, or compare scenarios without changing the underlying source data.',
    { tab: 'overview', anchor: 'overview.scenarios' },
    'overview',
    1,
  ),
  'overview.chart': draft(
    'overview.chart',
    'Net worth chart',
    'Charts the selected scenario as stacked bars or area (or compares scenario totals as lines). Optional goals and notes sit on the same timeline so you can read the stack against targets.',
    { tab: 'overview', anchor: 'overview.chart' },
    'overview',
    2,
  ),

  'income-cost': draft(
    'income-cost',
    'Budget',
    'Plans income and costs for a calendar year in CHF. Named scenarios hold the line items; switch between a year overview and a month-by-month working balance.',
    { tab: 'income-cost', anchor: 'income-cost' },
    null,
    0,
  ),
  'income-cost.budget': draft(
    'income-cost.budget',
    'Budget year',
    'Year view for the selected scenario: totals, income and cost tables, and a cash-flow diagram. Edit recurring or one-time lines and see how the year nets out.',
    { tab: 'income-cost', view: 'budget', anchor: 'income-cost.budget' },
    'income-cost',
    1,
  ),
  'income-cost.monthly': draft(
    'income-cost.monthly',
    'Monthly',
    'Spreads the year’s budget across months and tracks a working balance, including draws from savings when you configure them. Use it to see timing of surplus and shortfalls within the year.',
    { tab: 'income-cost', view: 'monthly', anchor: 'income-cost.monthly' },
    'income-cost',
    2,
  ),

  savings: draft(
    'savings',
    'Savings',
    'Models CHF savings accounts with balances, contribution cadence, and annual rates. Compounding is yearly; projections and actuals history live on separate tabs.',
    { tab: 'savings', anchor: 'savings' },
    null,
    0,
  ),
  'savings.accounts': draft(
    'savings.accounts',
    'Accounts & compounding',
    'Define each account’s current balance, contribution amount and cadence, annual rate, and how long contributions or compounding run. This is the input sheet the projections build from.',
    { tab: 'savings', view: 'inputs', anchor: 'savings.accounts' },
    'savings',
    1,
  ),
  'savings.progression': draft(
    'savings.progression',
    'Balance progression',
    'Shows past year-end balances and the forward compounded path for each account, plus a stacked chart of all accounts. Past months stay on Actuals; here the focus is year-end history and the projection.',
    { tab: 'savings', view: 'projection', anchor: 'savings.progression' },
    'savings',
    2,
  ),

  history: draft(
    'history',
    'History',
    'Charts and tables of recorded actuals only — portfolio monthly totals and savings year-end (or monthly) balances. Switch monthly vs yearly resolution and choose which series to include; totals are in CHF.',
    { tab: 'history', anchor: 'history' },
    null,
    0,
  ),

  projections: draft(
    'projections',
    'Projections',
    'Two workspaces for equity outlooks: Analyze builds and saves a ticker’s Easy/Advanced paths, and Comparables ranks those saved scenarios side by side with optional charts to a goal price.',
    { tab: 'projections', anchor: 'projections' },
    null,
    0,
  ),
  'projections.analyze': draft(
    'projections.analyze',
    'Analyze',
    'Look up a ticker, set Easy and/or Advanced valuation assumptions, and save the scenario. The path chart and projection table show market-cap (or equity) trajectories and implied CAGRs versus today.',
    { tab: 'projections', view: 'analyze', anchor: 'projections.analyze' },
    'projections',
    1,
  ),
  'projections.comps': draft(
    'projections.comps',
    'Comparables',
    'Pick a comparable set of saved projections, add year columns, and sort by a year’s ROI. Tick rows to overlay remaining upside or CAGR paths to that row’s year-end goal; click a name to open Analyze.',
    { tab: 'projections', view: 'comps', anchor: 'projections.comps' },
    'projections',
    2,
  ),
  'comparables.cagrChart': {
    id: 'comparables.cagrChart',
    title: 'CAGR to goal',
    summary:
      'Each point is the implied CAGR from that day’s price to a fixed year-end goal if the target is hit. Higher means a better time-weighted path under that assumption. Only names you already ticked on the comparables list appear.',
    body: `## How it works

Each chart point is the **implied CAGR** from that day’s price to your fixed year-end goal price, assuming the target is hit. The goal year and price stay fixed; only the starting price (and time left) change along the series.

Names on the chart are the projections you already ticked on the comparables list — nothing else is added automatically.

## How to interpret

**Higher is better** under that assumption: a higher implied CAGR means you need a stronger annualized path from that day’s price to still reach the same year-end goal. When price has already risen toward the goal, the required CAGR falls.

## Example

Same goal: **$200** at year-end **2028**.

- On **2024-01-02** at **$100**, years left ≈ 5 → implied CAGR ≈ **14.9%** (\`(200/100)^(1/5) − 1\`).
- On **2026-01-02** at **$150**, years left ≈ 3 → implied CAGR ≈ **10.1%** (\`(200/150)^(1/3) − 1\`).

Same finish line; a higher starting price leaves less annualized climb still required.

![Implied CAGR to a fixed goal — two dates, same $200 year-end 2028 target](ref:cagr-example)
`,
    references: [
      {
        id: 'cagr-example',
        src: '/guides/comparables-cagr-implied.jpg',
        alt: 'Implied CAGR to a fixed goal — two dates, same $200 year-end 2028 target',
        caption:
          'Same goal price and date; a higher starting price leaves less annualized climb still required.',
      },
    ],
    status: 'ready',
    location: {
      tab: 'projections',
      view: 'comps',
      anchor: 'comparables.cagrChart',
    },
    parentId: 'projections.comps',
    order: 3,
  },
  'comparables.upsideChart': draft(
    'comparables.upsideChart',
    'Remaining upside',
    'Each point is how much percentage upside remains from that day’s price to the same fixed year-end goal — not annualized. As price rises toward the goal, remaining upside falls; the series is the raw gap, not a CAGR.',
    { tab: 'projections', view: 'comps', anchor: 'comparables.upsideChart' },
    'projections.comps',
    4,
  ),

  portfolio: draft(
    'portfolio',
    'Portfolio',
    'Models one or more investing portfolios: cash, holdings, growth links to projections, planned actions, and recorded actuals. Tabs switch between the value chart, actuals, book configuration, and contribution-effectiveness tools.',
    { tab: 'portfolio', anchor: 'portfolio' },
    null,
    0,
  ),
  'portfolio.chart': draft(
    'portfolio.chart',
    'Chart',
    'Shows portfolio value over time (past actuals → Now → projected years) and a year grid of values and actions. Toggle stacked-by-position vs other display modes; planned buys/sells and deposits affect future years, not the Now book.',
    { tab: 'portfolio', view: 'chart', anchor: 'portfolio.chart' },
    'portfolio',
    1,
  ),
  'portfolio.actuals': draft(
    'portfolio.actuals',
    'Actuals',
    'Shared recorded history used across portfolios: month-end portfolio value and money-in (contributions). Past chart years pull from these actuals; enter totals in the display currency with FX when needed.',
    { tab: 'portfolio', view: 'actuals', anchor: 'portfolio.actuals' },
    'portfolio',
    2,
  ),
  'portfolio.cash': draft(
    'portfolio.cash',
    'Cash',
    'Configure cash and deposit balances by year for the selected portfolio. Deposits and sale proceeds land in cash; buys spend cash — this book feeds the value chart and year grid.',
    { tab: 'portfolio', view: 'cash', anchor: 'portfolio.cash' },
    'portfolio',
    3,
  ),
  'portfolio.positions': draft(
    'portfolio.positions',
    'Positions',
    'Holdings and share counts for the portfolio, including planned buy/sell actions by year. Positions combine with cash and linked growth assumptions to produce the projected portfolio value.',
    { tab: 'portfolio', view: 'positions', anchor: 'portfolio.positions' },
    'portfolio',
    4,
  ),
  'portfolio.growth': draft(
    'portfolio.growth',
    'Growth',
    'Links holdings to saved stock projections (or other growth assumptions) so future years revalue positions along those paths. Without a growth link, forward value stays flat aside from cash flows you enter.',
    { tab: 'portfolio', view: 'growth', anchor: 'portfolio.growth' },
    'portfolio',
    5,
  ),
  'portfolio.goal': draft(
    'portfolio.goal',
    'Contribution effectiveness',
    'Asks how extra contributions change the path toward a portfolio goal under your growth assumptions. Compare relative effectiveness of adding money at different times or amounts.',
    { tab: 'portfolio', view: 'goal', anchor: 'portfolio.goal' },
    'portfolio',
    6,
  ),

  settings: draft(
    'settings',
    'Data & backup',
    'Everything here is local to this device: browser storage, an optional linked JSON file for continuous save, and export/import for backups or moving accounts. There is no multi-user cloud database.',
    { tab: 'settings', anchor: 'settings' },
    null,
    0,
  ),
  'settings.browser': draft(
    'settings.browser',
    'Browser storage',
    'The fast local mirror of your current account while you work. Clearing site data wipes it — use a linked file or export if you need a durable copy.',
    { tab: 'settings', anchor: 'settings.browser' },
    'settings',
    1,
  ),
  'settings.linkedFile': draft(
    'settings.linkedFile',
    'Linked data file',
    'On desktop Chrome/Edge, link a JSON file so edits save continuously (after idle, and optionally on a timer). Put the file in cloud sync for multi-PC backup; iPhone/iPad should use Export/Import instead.',
    { tab: 'settings', anchor: 'settings.linkedFile' },
    'settings',
    2,
  ),
  'settings.export': draft(
    'settings.export',
    'Export / Import',
    'Download a JSON snapshot of the current account (or all accounts), or import a file to add/replace data. Table export is Excel-only and not for re-import; JSON is the round-trip backup format.',
    { tab: 'settings', anchor: 'settings.export' },
    'settings',
    3,
  ),
}

/** Matches App sidebar top-to-bottom (Life → Investing → System). */
const TAB_ORDER: AppTab[] = [
  'overview',
  'income-cost',
  'savings',
  'history',
  'projections',
  'portfolio',
  'settings',
]

/** Sidebar section labels for the registry index. */
const SIDEBAR_SECTIONS: { id: string; label: string; tabs: AppTab[] }[] = [
  {
    id: 'life',
    label: 'Life',
    tabs: ['overview', 'income-cost', 'savings', 'history'],
  },
  {
    id: 'investing',
    label: 'Investing',
    tabs: ['projections', 'portfolio'],
  },
  {
    id: 'system',
    label: 'System',
    tabs: ['settings'],
  },
]

export function getGuide(id: FeatureGuideId): FeatureGuide | undefined {
  return GUIDES[id]
}

/** True only when the guide exists and is marked ready for in-app Guide buttons. */
export function isGuideReady(id: FeatureGuideId): boolean {
  return getGuide(id)?.status === 'ready'
}

export function listGuides(): FeatureGuide[] {
  return Object.values(GUIDES).sort((a, b) => {
    const ta = TAB_ORDER.indexOf(a.location.tab)
    const tb = TAB_ORDER.indexOf(b.location.tab)
    if (ta !== tb) return ta - tb
    return a.order - b.order
  })
}

function guideTabGroup(tab: AppTab, all: FeatureGuide[]): GuideTabGroup {
  const byId = new Map(all.map((g) => [g.id, g]))

  function childrenOf(parentId: string): GuideTreeNode[] {
    return all
      .filter((g) => g.parentId === parentId)
      .sort((a, b) => a.order - b.order)
      .map((guide) => ({ guide, children: childrenOf(guide.id) }))
  }

  const roots = all
    .filter((g) => g.location.tab === tab && (g.parentId == null || !byId.has(g.parentId)))
    .sort((a, b) => a.order - b.order)
    .map((guide) => ({ guide, children: childrenOf(guide.id) }))
  return { tab, label: TAB_LABELS[tab], roots }
}

export function listGuideTree(): GuideTabGroup[] {
  const all = listGuides()
  return TAB_ORDER.map((tab) => guideTabGroup(tab, all)).filter((g) => g.roots.length > 0)
}

/** Registry index: sidebar sections, then page tabs left-to-right within each page. */
export function listGuideSidebarTree(): GuideSidebarSection[] {
  const all = listGuides()
  return SIDEBAR_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    tabs: section.tabs
      .map((tab) => guideTabGroup(tab, all))
      .filter((g) => g.roots.length > 0),
  })).filter((s) => s.tabs.length > 0)
}
