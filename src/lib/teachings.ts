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
  'income-cost.monthly': {
    id: 'income-cost.monthly',
    title: 'Monthly',
    summary:
      'Turns the year’s Budget lines into a Jan–Dec cash path so you can place amounts on the right months, watch working balance move, and plan draws without running short of cash mid-year.',
    body: `## How it works

**Monthly** reads the selected scenario’s income and cost positions from **Budget** and lays them across Jan–Dec.

On **Budget**, each position has a payment schedule:

- **Monthly** (no months selected) — yearly amount ÷12 every month
- **Selected months** — yearly total split equally across those months (rounding remainder on the last selected month)

Pin annual bills, bonuses, and one-offs to the months they actually hit. That is what makes a model of about monthly accuracy possible; a flat ÷12 average hides timing.

This view then builds the path:

- **Opening cash (Dec prior year)** — permanent Cash savings year-end from Savings → Actuals
- **Inflow / Outflow / Net** — budget lines in that month
- **Balance** — cumulative working balance from opening + nets (budget only)
- **Draws** — optional CHF you plan to take from working balance in specific months (vacation, tax, gifts, buffer top-ups, …)
- **After draws** — same path with draws subtracted

Use **+ Draw** under **Working balance** to name a reason and enter amounts per month. Draws are informative only — they do not change annual Budget net, the Sankey, or portfolio deposits.

The chart and table share the same series (**Inflow**, **Outflow**, **Balance**, **Draws**, **After draws**); toggle series under the chart if you want a quieter view.

## How to interpret

Watch **where Balance moves**, not only year-end totals. A healthy **Annual net** can still dip negative mid-year if a large cost lands before the cash that funds it.

- **Balance** answers: “If I only run the budget, does working capital stay solvent month by month?”
- **After draws** answers: “After the spending I already know is coming out of cash, am I still okay?”

Plan the year with draws so **After draws** stays comfortable — that is how you avoid struggling with working capital when known outflows cluster. If a trough looks wrong, fix payment months on **Budget** (or shift draws), then re-read this path.

## Example

Opening cash **CHF 2,000**. Salary **CHF 72,000** on **Monthly** (CHF 6,000/mo). Bonus **CHF 12,000** on **Dec** only. Rent **CHF 24,000** on **Monthly** (CHF 2,000/mo). Car insurance **CHF 1,800** on **Jan** only. Draw **Vacation** **CHF 4,000** in **Jul**.

- **Jan** — Inflow 6,000, Outflow 3,800 → Net 2,200 → **Balance 4,200** (insurance spike is visible)
- **Jul** — Balance climbs to **28,200**; after the vacation draw **After draws** is **24,200**
- **Dec** — bonus lands → year-end **Balance 60,200**, **After draws 56,200**

Same yearly totals with insurance and bonus left on **Monthly** would smooth Jan and Dec and hide those timing bumps — the working-capital story would look safer than it is.
`,
    status: 'ready',
    location: {
      tab: 'income-cost',
      view: 'monthly',
      anchor: 'income-cost.monthly',
    },
    parentId: 'income-cost',
    order: 2,
  },

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
  'portfolio.goal': {
    id: 'portfolio.goal',
    title: 'Contribution effectiveness',
    summary:
      'Shows how much sooner extra contributions get you to a wealth goal under a compounding rate. Early dollars shorten time-to-goal disproportionately vs later ones — and the absolute years saved loom larger when assumed CAGR is lower.',
    body: `## How it works

Pick a **goal** amount, a **compounding rate** (CAGR), and a **start** (Now, a projected year-end, or a custom amount). The tool then walks a simple path: wealth compounds at that rate each year; year-end contributions are added with **no growth in the contribution year** (same timing as the portfolio Cash deposits).

Each table row is cumulative:

- **Base** — start only, no extras
- **+YYYY** — base plus every contribution through that year

For each row you get the goal date, time from the clock origin, how much **faster** that year’s extras are than the previous row, and **relative effectiveness**.

**Stated** extras pull deposits from the Cash tab after the start year. **Custom** extras are what-if only — they never write back to Cash.

## How to interpret

**Earlier contributions count disproportionately more** than later ones of the same size. A dollar that compounds for more years pulls the goal date forward more than a dollar added near the finish. The **Rel. effect.** column makes that concrete: exact time saved per currency unit this year, divided by exact time saved per unit in the **last** contribution year (the last year is always **1.00×**). Values above 1× mean that year’s money bought more calendar time than the final year’s money.

That imbalance is especially visible when **assumed CAGR is lower**. Growth alone closes less of the gap, so shifting the same contribution earlier saves **more absolute years**. At a higher rate, relative multiples can look larger (early dollars still outpace late ones in the \`(1+r)^n\` sense), but the calendar years you claw back from contributing early shrink because compounding is already doing more of the work.

Use the chart to see the whole path to the goal; click a table row for the year-by-year math.

## Example

Start **$100k**, goal **$300k**, same **$20k** contribution — only the year and rate change.

**At 4% CAGR**

- +$20k in **2026** → about **4.65 years** sooner than base (rel. effect. ≈ **1.59×**)
- +$20k in **2034** → about **2.93 years** sooner than the prior path (rel. effect. **1.00×**)

**At 10% CAGR** (same dollars)

- +$20k in **2026** → about **1.91 years** sooner (rel. effect. ≈ **2.43×**)
- +$20k in **2034** → about **0.79 years** sooner (**1.00×**)

Same early-vs-late story both times; at the **lower** rate the early contribution saves far more **calendar** time.

![Early contributions shorten time-to-goal more — especially at lower CAGR](ref:contrib-effectiveness)
`,
    references: [
      {
        id: 'contrib-effectiveness',
        src: '/guides/portfolio-contribution-effectiveness.svg',
        alt: 'Early contributions shorten time-to-goal more — especially at lower CAGR',
        caption:
          'Same $20k contribution: early money saves more years than later money, and the absolute years saved are larger when assumed CAGR is lower.',
      },
    ],
    status: 'ready',
    location: {
      tab: 'portfolio',
      view: 'goal',
      anchor: 'portfolio.goal',
    },
    parentId: 'portfolio',
    order: 6,
  },

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
