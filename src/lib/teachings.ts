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
  overview: {
    id: 'overview',
    title: 'Overview',
    summary:
      'Builds a year-by-year net-worth picture in CHF by stacking portfolios, savings, and other series. Switch scenarios, chart modes, and the Runway tab without changing underlying Portfolio, Savings, or Budget data.',
    body: `## How it works

**Overview** is the Life tab that rolls your configured assets into one CHF timeline per **scenario**.

### Page tabs

- **Net worth** — stack chart plus **Asset series** editor for the selected scenario
- **Runway** — same asset stack with a cashflow overlay (see the **Runway** guide)

### What stays shared

Portfolios, savings accounts, and Budget lines live in their own tabs. Overview scenarios only **reference** them (which portfolio, which savings accounts, optional Budget bindings on manual series).

> Changing Portfolio or Savings inputs reshapes every Overview scenario that includes those sources.

## How to interpret

Use Overview to answer: “If these sources behave as configured, how big is the stack over time — and how do named what-ifs differ?”

Past bars can show **recorded actuals** when History data exists; future years are modeled. **Now** is the live as-of point between them.

## Example

One scenario stacks **Portfolio A** and **Cash** savings; another adds a **manual** series with Budget surplus routed in from **2026 · Base**. **Compare** mode plots both scenario totals as lines over the same **From / To** range — same underlying books, different inclusion or bindings.
`,
    status: 'ready',
    location: { tab: 'overview', anchor: 'overview' },
    parentId: null,
    order: 0,
  },
  'overview.scenarios': {
    id: 'overview.scenarios',
    title: 'Scenarios',
    summary:
      'Each scenario is a named net-worth stack: enabled asset series, optional notes, and (on Runway) its own cashflow periods. Fork with Save as… without touching Portfolio or Savings source data.',
    body: `## How it works

A scenario stores **which series** are in the stack, their order, and optional **Notes / assumptions**. It does not duplicate portfolio holdings or savings math.

### Toolbar

- **+ New** — blank scenario; savings accounts sync in automatically (at least **Cash**)
- **Save as…** — fork the current stack under a new name (compare sets remember the new id when you had an explicit compare list)
- **Delete** — removed when at least two scenarios exist
- **Select** + name field — switch and rename the active scenario

Notes are text only — they do not change calculations.

## How to interpret

Treat scenarios as **labeled what-ifs**: same global data, different inclusion, bindings, or Runway overlay.

> **Compare** mode uses scenario totals — create a second scenario (often via **Save as…**) before expecting multiple lines.

## Example

**Base** includes Portfolio + all savings. **Save as…** → **Aggressive**; disable one savings account in **Asset series**. **Compare** with both checked shows two total lines; editing series while **Aggressive** is selected only changes that scenario’s stack.
`,
    status: 'ready',
    location: { tab: 'overview', anchor: 'overview.scenarios' },
    parentId: 'overview',
    order: 1,
  },
  'overview.chart': {
    id: 'overview.chart',
    title: 'Net worth',
    summary:
      'Charts the selected scenario as stacked bars or area, or compares scenario totals as lines. Past → Now → future in CHF; optional recorded overlay, goals, and notes on the Net worth tab.',
    body: `## How it works

Timeline reads **From** and **To** calendar years (stored on the scenario). The X-axis is past years, **Now** (live), then projected years.

### Chart mode (Net worth tab)

- **Bars** — stacked columns by enabled series
- **Area** — same stack as filled areas
- **Compare** — one line per scenario total (checkbox **Show** list); portfolio USD series need a USD→CHF rate

### Overlays (Net worth tab only)

- **Show recorded actuals** — amber overlay from History when available
- **Show Goals** — horizontal targets when goals exist
- **Chart notes** — pin annotations on the timeline

Click a year (not in Compare) for the year breakdown panel.

> **Runway** reuses this chart panel but hides Compare, goals, notes, and recorded overlay — open the **Runway** guide for cashflow.

## How to interpret

Read **stack height** and **mix**, not just the total. Colors follow origin: portfolio greens, savings blues, manual amber/violet, leftover pink.

> **Now** uses live portfolio/savings values; future years follow each series’ growth, contributions, and Budget bindings.

## Example

**From 2024 · To 2035**, **Area** mode, one portfolio + savings enabled. Recorded actuals sit on past years; **2030** bar height is pure projection. Switch **Compare**, tick two scenarios — lines show totals only (no stack split).
`,
    status: 'ready',
    location: { tab: 'overview', view: 'networth', anchor: 'overview.chart' },
    parentId: 'overview',
    order: 2,
  },
  'overview.series': {
    id: 'overview.series',
    title: 'Asset series',
    summary:
      'Configure what goes into the selected scenario’s stack: portfolios, savings accounts, manual “other” piles, and permanent leftover cash. Drag stack order; bind Budget years to route surplus.',
    body: `## How it works

Each row is one **stack layer** on the Net worth chart. Drag **⋮⋮** on groups to reorder; expand **▸** to edit.

### Series types

- **Savings** group — every savings account appears here; toggle accounts or the whole group. **Cash** is permanent and stays included
- **Portfolio** — links one portfolio book (USD converted at the Overview FX rate)
- **Other** (manual) — flat **base CHF**, optional **annual rate**, **Year → Income/Cost → %** rows claiming Budget surplus for that calendar year
- **Leftover** (permanent) — receives Budget cash not claimed by manual **%** rows; optional **perpetual yearly CHF** after bindings end

### Common fields

- **Compound until** / **Contribute until** — last year growth or additions apply (blank = no limit)
- **Draw locked until** — Runway cannot tap this pile before that year (Runway tab)

Manual **%** on a Budget year must sum with other claims; unclaimed income-cost net flows to **Leftover**.

## How to interpret

Disabled series drop out of the chart but stay configured. Missing portfolio links show a warning until you pick a valid book.

> Stack order is **bottom-to-top** in bars — the first group in the list is the bottom slice.

## Example

**2026** binding: manual **Invest** at **60%** of **2026 · Base** Budget net, **Leftover** gets the residual. **+ Other** with **CHF 50k** base and **3%** rate adds a layer that compounds after **Now** unless **Compound until** stops it.
`,
    status: 'ready',
    location: { tab: 'overview', view: 'networth', anchor: 'overview.series' },
    parentId: 'overview',
    order: 3,
  },
  'overview.runway': {
    id: 'overview.runway',
    title: 'Runway',
    summary:
      'Forks a scenario’s asset stack and overlays year-by-year income and living costs so you can rehearse phased work, early retirement, or other cashflow paths — and see when the stack runs dry.',
    body: `## How it works

**Runway** keeps the selected Overview scenario’s portfolios, savings, leftover, and other series growing as configured. You only change the **cashflow overlay** — yearly income in, living cost out.

### Start from Scenarios

- **+ New** or **Save as…** — fork a named what-if without touching the base stack
- Notes hold assumptions only
- Then open the **Runway** page tab

### Runway periods

Ordered rows under the chart. Each row’s **From** year lasts until the next row (or chart **To**).

- **Manual income** — enter CHF / year; set **Draw** as **% of income** or **Fixed CHF**
- **Budget income** — pull yearly income from a Budget scenario; still set Draw yourself
- **Keep Budget as in…** — that Budget’s income is in and its costs are the draw

Each row shows resolved **in → out** for its start year. **+ Period** adds the next stage (full work → part-time → stopped).

### Draw order

Which piles pay a deficit (draw > income). Drag to reorder.

- **Locked until** — skip a series before that year
- **Before / After** — when that pile is tapped relative to its own growth

Click a future year on the chart for the year math: income, draw needed, growth, and what left each pile.

## How to interpret

Watch the **stack after Now**, not the past bars. Past years are modeled net-worth history; grow-and-spend starts at **Now**.

- Income covers draw → gap is zero; assets keep compounding (Budget-linked modes can add surplus onto leftover)
- Draw exceeds income → gap comes from assets in draw order
- Stack collapses toward zero before your horizon → path is not sustainable yet — push leaner periods later, cut the draw, or grow the stack first

> **Sustainable** — you can phase work (or other income) down and asset growth still covers living costs through the horizon.

> **Financial independence** — living cost is covered with **no earned income**, and the stack still lasts under these assumptions.

The question to answer: if assets keep behaving as configured, when can I phase work down without running out — and when am I financially independent?

## Example

Same asset stack. Living cost stays **CHF 80k / year**. Only earned income phases out.

- **2026–2034** — Manual income **CHF 100k**, Draw **Fixed CHF 80k** → surplus; stack still grows
- **2035–2039** — Manual income **CHF 40k**, Draw **Fixed CHF 80k** → **CHF 40k / year** from assets
- **2040 onward** — Manual income **CHF 0**, Draw **Fixed CHF 80k** → full **CHF 80k / year** draw

If piles near empty in the early 2040s, start the 40k or 0k period later (or trim the fixed draw) until the stack lasts through the horizon. That start year is the earliest phase-out this stack can fund.

![Phase work down in periods; lasting stack means sustainable path, zero income lasting means FI](ref:runway-phase-out)
`,
    references: [
      {
        id: 'runway-phase-out',
        src: '/guides/overview-runway-phase-out.svg',
        alt: 'Phase work down in periods; lasting stack means sustainable path, zero income lasting means FI',
        caption:
          'Same living cost, stepped-down income: lasting stack = sustainable; lasting at zero earned income = financially independent.',
      },
    ],
    status: 'ready',
    location: {
      tab: 'overview',
      anchor: 'overview.runway',
    },
    parentId: 'overview',
    order: 4,
  },

  'income-cost': {
    id: 'income-cost',
    title: 'Budget',
    summary:
      'Plans income and costs per calendar year in CHF. Named scenarios hold line items; the Budget tab is the annual sheet, Monthly spreads it across months with working balance.',
    body: `## How it works

**Budget** (sidebar label) stores **scenarios** — each has a **Year**, a name, income/cost **positions**, and optional **Monthly** draws.

### Workspace tabs

- **Budget** — annual totals, position tables, and cash-flow Sankey for the selected scenario
- **Monthly** — Jan–Dec path, opening cash, and informative draws (see the **Monthly** guide)

Amounts are **CHF**. Scenarios are ordered by drag on the chip strip; **Copy…** clones lines and draws into a new scenario.

> Overview **Runway** and manual series bindings read Budget scenarios by **calendar year** — keep scenario **Year** aligned with the year you mean.

## How to interpret

Annual **Net / year** is the headline solvency check; **Monthly** catches timing inside the year.

## Example

**2025 · Base** holds salary and rent; **Copy…** → **2026 · Base** and bump salary for a raise scenario. Overview manual series bind to **2026 · Base** by year without duplicating line items here.
`,
    status: 'ready',
    location: { tab: 'income-cost', anchor: 'income-cost' },
    parentId: null,
    order: 0,
  },
  'income-cost.budget': {
    id: 'income-cost.budget',
    title: 'Budget',
    summary:
      'Annual view for the selected scenario: scenario strip and year, summary metrics, Income and Costs tables, and the cash-flow Sankey. Payment months on lines feed the Monthly tab.',
    body: `## How it works

Everything on this tab belongs to the **selected scenario** (chip strip at top).

### Scenario strip

Drag chips to reorder; double-click to rename; **Year** applies to this scenario’s calendar year; **+ Scenario** / **Copy…** / delete (when more than one).

### Summary

**Costs / month** and **Income / month** use **recurring** positions only (yearly ÷ 12). **Costs / year** and **Income / year** include **one-time** lines. **Net** rows follow the same split.

### Income and Costs tables

Each side has **Recurring** and **One-time** sections. Default sort is **yearly amount descending** (persisted per table). Columns include yearly and monthly display; **Payment** schedule:

- **Monthly** (no months picked) — yearly ÷ 12 every month
- Selected months — equal split across those months; rounding remainder on the **last** selected month

One-time lines count in yearly totals only.

### Cash flow Sankey

Shows yearly flows for this scenario: income nodes into **Total income**, out to cost lines and **Net** (surplus or **Unfunded** gap). Empty income with costs shows an **Unfunded** bridge.

## How to interpret

> **Net / month** ignores one-time spikes — a bonus-only-in-December story still looks “smooth” here; open **Monthly** for timing.

Sankey is yearly-only; it does not include Monthly **Draws**.

## Example

Recurring salary **CHF 120k**, rent **CHF 24k** → **Net / month CHF 8k**, **Net / year CHF 96k**. Insurance **CHF 1,800** one-time on **Jan** adds to **Net / year** but not **Net / month**. Sankey width matches those yearly totals.
`,
    status: 'ready',
    location: { tab: 'income-cost', view: 'budget', anchor: 'income-cost.budget' },
    parentId: 'income-cost',
    order: 1,
  },
  'income-cost.monthly': {
    id: 'income-cost.monthly',
    title: 'Monthly',
    summary:
      'Turns the year’s Budget lines into a Jan–Dec cash path so you can place amounts on the right months, watch working balance move, and plan draws without running short of cash mid-year.',
    body: `## How it works

**Monthly** reads the selected scenario’s income and cost positions from **Budget** and lays them across Jan–Dec.

### Payment schedule (on Budget)

- **Monthly** (no months selected) — yearly amount ÷12 every month
- **Selected months** — yearly total split equally across those months (rounding remainder on the last selected month)

Pin annual bills, bonuses, and one-offs to the months they actually hit. A flat ÷12 average hides timing.

### The cash path

- **Opening cash (Dec prior year)** — permanent Cash savings year-end from Savings → Actuals
- **Inflow / Outflow / Net** — budget lines in that month
- **Balance** — cumulative working balance from opening + nets (budget only)
- **Draws** — optional CHF you plan to take from working balance in specific months
- **After draws** — same path with draws subtracted

Use **+ Draw** under **Working balance** to name a reason and enter amounts per month.

> Draws are informative only — they do not change annual Budget net, the Sankey, or portfolio deposits.

The chart and table share the same series (**Inflow**, **Outflow**, **Balance**, **Draws**, **After draws**); toggle series under the chart for a quieter view.

## How to interpret

Watch **where Balance moves**, not only year-end totals. A healthy **Annual net** can still dip negative mid-year if a large cost lands before the cash that funds it.

> **Balance** — “If I only run the budget, does working capital stay solvent month by month?”

> **After draws** — “After the spending I already know is coming out of cash, am I still okay?”

Plan so **After draws** stays comfortable when known outflows cluster. If a trough looks wrong, fix payment months on **Budget** (or shift draws), then re-read this path.

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

  savings: {
    id: 'savings',
    title: 'Savings',
    summary:
      'Models CHF savings accounts with balances, contribution cadence, and annual rates. Compounding is yearly; projections and actuals history live on separate tabs.',
    body: `## How it works

Savings holds **CHF** end-of-month balances per account. Three sub-tabs split **assumptions**, **recorded history**, and **forward path**.

### Sub-tabs

- **Inputs** — current balance, contributions, rate, and until-years per account
- **Actuals** — year-end and monthly recorded balances (feeds **History** and Budget **Monthly** opening cash)
- **Projection** — year-end past columns plus the compounded forward path and stacked chart

> Compounding is **always yearly** and applies only **December → January** on the prior balance.

## How to interpret

Use **Inputs** for what should happen next; **Actuals** for what you measured; **Projection** to see the combined timeline without editing monthly detail there.

> **Overview** and other tabs read these accounts — they do not duplicate savings math.

## Example

**Cash** at **CHF 10,000** end-Nov, **4%** rate, **CHF 500** monthly contribution. Nov→Dec adds **500** (no interest mid-year). Dec→Jan applies **4%** on the December balance, then January’s **500** — interest hits once at the year turn, not every month.
`,
    status: 'ready',
    location: { tab: 'savings', anchor: 'savings' },
    parentId: null,
    order: 0,
  },
  'savings.accounts': {
    id: 'savings.accounts',
    title: 'Accounts & compounding',
    summary:
      'Define each account’s current balance, contribution amount and cadence, annual rate, and how long contributions or compounding run. This is the input sheet the projections build from.',
    body: `## How it works

Each row is one savings account. Amounts are **CHF**; the **Now** column is the current end-of-month balance.

### Row fields

- **Contribution** + **Cadence** — **Monthly** adds every month; **Yearly** adds in **January** only (after Dec→Jan compound)
- **Rate %** — annual rate; compounding runs only on **December → January**
- **Compound until** / **Contribute until** — optional last calendar year for interest or deposits (blank = no limit)

> **Cash** is permanent — it cannot be removed; Budget **Monthly** uses its year-end actual as opening working cash.

## How to interpret

The table total is a snapshot at **Now**. Changing inputs reshapes **Projection** and any Overview series tied to these accounts.

## Example

**CHF 20,000** balance, **CHF 1,200** yearly contribution, **3%** rate, **Contribute until 2028**. Through 2028 each January adds **1,200** after compound; from **2029** onward balance still compounds at **3%** but contributions stop.
`,
    status: 'ready',
    location: { tab: 'savings', view: 'inputs', anchor: 'savings.accounts' },
    parentId: 'savings',
    order: 1,
  },
  'savings.actuals': {
    id: 'savings.actuals',
    title: 'Actuals',
    summary:
      'Record year-end balances, the live current month, and optional monthly history. Projection and Budget read these values; detailed charts use History.',
    body: `## How it works

### Yearly actuals

- **Add past year** — inserts a **December** row for that year
- **Now** row — highlighted current month; overrides the simulated path from **Inputs**
- Totals sum accounts for each period

### Monthly detail

Below the yearly grid, enter end-of-month balances per account. These feed **History** when savings series are included.

> Permanent **Cash** year-end **December** is **Opening cash** on Budget → **Monthly** (prior calendar year).

## How to interpret

Actuals win over projection wherever you enter a number. Leave cells empty to let **Inputs** + math fill the gap.

## Example

Enter **CHF 15,000** for **Cash** on **2024-12**. Budget **Monthly** for **2025** opens working balance at **15,000**; the same **2024-12** point appears in **History** on a yearly savings series.
`,
    status: 'ready',
    location: { tab: 'savings', view: 'actuals', anchor: 'savings.actuals' },
    parentId: 'savings',
    order: 2,
  },
  'savings.progression': {
    id: 'savings.progression',
    title: 'Balance progression',
    summary:
      'Shows past year-end balances and the forward compounded path for each account, plus a stacked chart of all accounts. Past months stay on Actuals; here the focus is year-end history and the projection.',
    body: `## How it works

### Balance progression table

- Past columns — **December** year-ends (from **Actuals** or added past years)
- **Now** — current month
- Later columns — projected from **Inputs** (dense months, then milestone years)

### All accounts chart

Stacked area of every account on the same timeline as the table — past actuals plus forward projection.

> Monthly detail is not edited here; use **Actuals** or **History** for month-by-month balances.

## How to interpret

**Actual** columns are fixed history; **projected** columns show the path if current inputs hold. The chart total matches the table sum at each point.

## Example

Two accounts: **Cash** **CHF 5,000** actual at last December, **Emergency** projected forward at **2%** with no contributions. The table shows **Cash** flat on past years then both stacks rising in the chart after **Now** only where rates and contributions apply.
`,
    status: 'ready',
    location: { tab: 'savings', view: 'projection', anchor: 'savings.progression' },
    parentId: 'savings',
    order: 3,
  },

  history: {
    id: 'history',
    title: 'History',
    summary:
      'Recorded actuals only — shared portfolio month-end totals and per-account savings balances. Chart controls, series inclusion, and a year-end table; CHF totals with USD portfolio converted when a rate is available.',
    body: `## How it works

History never projects forward. Data comes from **Portfolio → Actuals** (one shared investing total) and **Savings → Actuals** (per account).

### Chart controls

- **Resolution** — **Monthly** points per month; **Yearly** uses the **last month entered** in each calendar year (December if present)
- **Chart** — **Line** or **Stacked**; **Series** — **Total** (one combined CHF line/stack) or **By asset** (each included series)
- **From / To** — filter the chart and table (defaults to your data span)

**Recorded actuals** chart supports the same **Goals** and **notes** widgets as other charts. Below the chart: **Latest** total, as-of label, and **YoY vs prior year-end** (CHF series only).

USD portfolio actuals wait for USD→CHF; until then they are excluded from the CHF total banner.

### Include

Checkboxes under **Portfolios** and **Savings** toggle series on the chart and table. Stale or gap hints (amber) use completeness rules: yearly-style series vs monthly gaps inside the selected range.

### Year-end table

Grid of **December (or year rollup) values** per series for each year in range. Sort **Latest** (default, highest recent value first) or **YoY** (strongest growth first). **YoY** column compares last populated year in range to the prior year.

## How to interpret

> **Yearly** resolution is not “calendar year-end only” — it picks the **latest month you entered** that year.

Use History to audit what you typed; Overview **Show recorded actuals** overlays this data on projections.

## Example

Portfolio **USD 100k** in **2024-11**, **Cash CHF 5k** in **2024-12**, rate **0.9** → Latest total ≈ **CHF 95k + 5k**. Switch **Yearly**, **By asset** — two series; table **YoY** sort surfaces which account moved most year over year.
`,
    status: 'ready',
    location: { tab: 'history', anchor: 'history' },
    parentId: null,
    order: 0,
  },

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

Each chart point is the **implied CAGR** from that day’s price to your fixed year-end goal price, assuming the target is hit.

The goal year and price stay fixed; only the starting price (and time left) change along the series.

Names on the chart are the projections you already ticked on the comparables list — nothing else is added automatically.

## How to interpret

> **Higher is better** under that assumption: a higher implied CAGR means you need a stronger annualized path from that day’s price to still reach the same year-end goal.

When price has already risen toward the goal, the required CAGR falls.

## Example

Same goal: **$200** at year-end **2028**.

- On **2024-01-02** at **$100**, years left ≈ 5 → implied CAGR ≈ **14.9%** (\`(200/100)^(1/5) − 1\`)
- On **2026-01-02** at **$150**, years left ≈ 3 → implied CAGR ≈ **10.1%** (\`(200/150)^(1/3) − 1\`)

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

  portfolio: {
    id: 'portfolio',
    title: 'Portfolio',
    summary:
      'Models one or more investing books in your chosen display currency: chart and year grid, shared Actuals, Cash and Positions configuration, optional perpetual Growth, and Contribution effectiveness.',
    body: `## How it works

**Portfolio** holds named books you can switch with the **Portfolio** picker (**New**, **Copy**, **Manage…**).

### Workspace tabs

- **Chart** — value timeline and **Value by year** for the selected book
- **Actuals** — shared month-end **Portfolio value** and **Money in** (all books read the same history)
- **Cash**, **Positions**, **Growth** — configure the selected book
- **Contribution effectiveness** — time-to-goal math for extra deposits

### Display currency

**USD** or **CHF** toggles how numbers are shown. Amounts are stored in the currency you enter on deposits; CHF view converts with a live **USD→CHF** rate when needed.

> **Actuals** and **History** investing series are shared — one portfolio-value track for every book.

## How to interpret

Each book is an isolated scenario (cash, holdings, actions). The picker only changes which book you edit; it does not merge books on the chart.

## Example

**New** → rename in **Manage…** → add holdings on **Positions** and deposits on **Cash** → **Chart** shows **Now** from the live book and forward years from plans. A second book via **Copy** starts from the same structure without touching **Actuals**.
`,
    status: 'ready',
    location: { tab: 'portfolio', anchor: 'portfolio' },
    parentId: null,
    order: 0,
  },
  'portfolio.chart': {
    id: 'portfolio.chart',
    title: 'Chart',
    summary:
      'Portfolio value over time (past actuals → Now → projected years) plus a year grid. Modes, overlays, and From/To range; planned actions affect future years, not the Now book.',
    body: `## How it works

Timeline runs **From** / **To** calendar years (custom range or **Inputs only** to snap back to years with data).

### Chart display

- **By position** — stacked bars per holding (+ cash)
- **Portfolio value** — single total bar

Optional right-axis overlays:

- **Cash / invested** — invested vs cash mix
- **ROI** — return overlay when actuals exist
- **Target** — compounding line from **Year**, **Anchor**, and **Rate** (uses **Money in** in past years, planned **Cash** deposits later)

Past years use **Actuals → Portfolio value** (last month in each year). **Now** is the live book; future bars follow projections, deposits, and actions.

### Value by year

Grid of year columns: holdings, cash, totals, and planned **buy/sell** actions. **Now** reflects shares held today; buys/sells from their year onward spend or fill **Cash**.

## How to interpret

> Planned trades in a future year do not change the **Now** column — only forward years.

Extend **To** to see projection-linked growth or perpetual **Growth** % after the last explicit input year.

## Example

**By position**, **From 2022 · To 2030**, one stock linked to a saved projection. Past bars match **Actuals**; **2026** column shows a planned buy spending **Cash** entered on the **Cash** tab — total rises from shares, not from retroactive **Now** changes.
`,
    status: 'ready',
    location: { tab: 'portfolio', view: 'chart', anchor: 'portfolio.chart' },
    parentId: 'portfolio',
    order: 1,
  },
  'portfolio.actuals': {
    id: 'portfolio.actuals',
    title: 'Actuals',
    summary:
      'Shared recorded history for every portfolio: month-end total value and yearly money-in. Enter totals in display currency; the Chart past uses portfolio value actuals.',
    body: `## How it works

Two views of the **same shared record** (not per book):

### Portfolio value

Month-end **total portfolio value** in display currency. Feeds the **Chart** past segment and **History** investing series.

### Money in

Contributions by calendar year — separate from per-book **Cash** deposits but available for **Chart → Target** overlay in past years.

Switch with the **Portfolio value** / **Money in** tabs. Opening this guide lands on **Portfolio value**.

> Label on page: **Same record for every portfolio.**

## How to interpret

Gaps or stale months surface in **History** completeness hints; filling value here fixes past bars on **Chart** for all books.

CHF display with USD-native entries waits on a live rate before converting stored USD actuals.

## Example

Enter **display currency 250k** for **2024-11** under **Portfolio value**. Every book’s **Chart** shows that point in **2024** past bars; **Money in** for **2024** can still record how much you contributed that year for **Target** math.
`,
    status: 'ready',
    location: { tab: 'portfolio', view: 'actuals', anchor: 'portfolio.actuals' },
    parentId: 'portfolio',
    order: 2,
  },
  'portfolio.cash': {
    id: 'portfolio.cash',
    title: 'Cash',
    summary:
      'Opening cash and planned deposits for the selected portfolio by year. Fixed or Budget-surplus amounts, optional perpetual yearly deposit; proceeds and buys flow through the cash book.',
    body: `## How it works

### Cash & deposits

- **Opening row** — current cash (this calendar year); cannot be removed
- **+ Deposit** — explicit year rows: **Fixed** amount or **% of Income/Cost surplus** from a Budget scenario (needs FX when surplus is CHF and book is USD)
- **Perpetual yearly** — after the last explicit deposit year, repeat a fixed or surplus-linked amount each year
- **Copy cash…** — push opening + deposits + perpetual row to other books

Columns show plan vs already deposited vs **Cash after** that year.

> Sale proceeds from **Positions** land in cash; buys spend cash in their action year.

## How to interpret

Deposits are plan lines — they move **Cash** on the **Chart** / grid in future years, not **Actuals Money in** unless you also record contributions there.

Surplus-linked rows resolve when Budget net and FX are available.

## Example

Opening **display currency 10k**, **2026** fixed deposit **5k**, perpetual **+2k/yr** after **2028**. A **2027** sell on **Positions** adds proceeds to **2027** cash before the next buy spends it.
`,
    status: 'ready',
    location: { tab: 'portfolio', view: 'cash', anchor: 'portfolio.cash' },
    parentId: 'portfolio',
    order: 3,
  },
  'portfolio.positions': {
    id: 'portfolio.positions',
    title: 'Positions',
    summary:
      'Holdings for the selected portfolio: stocks from saved projections, manual marks, and options; sort order; saved projection links; and year buy/sell actions.',
    body: `## How it works

### Holdings list

- **+ Add from projections…** — stock rows tied to **Projections → Analyze** saves (symbol, shares, **Saved projection** path)
- **+ Option**, manual / absolute marks — valued without a projection link
- **Sort** — as added, A–Z, or by value (display order only)

Expand a row to set shares, projection basis (**Easy mcap**, **P/S**, etc.), and **Actions** by calendar year (buy/sell quantities).

### Copy holdings…

Duplicate positions (optionally with actions) to another book.

> Without a **Saved projection**, forward value follows marks and actions only — not the equity path from **Projections**.

Perpetual **Growth** % on the **Growth** tab applies after the last year with explicit inputs.

## How to interpret

**Now** share counts drive the live **Chart** slice; year columns show simulated holdings after planned trades.

Negative quantity or marks are allowed (shorts / liabilities).

## Example

Link **AAPL** to a saved **2028** projection scenario; **2026** action buy **100** shares spends **Cash** from the **Cash** tab. **Chart → By position** shows AAPL’s stack growing along the projection path after **Now**.
`,
    status: 'ready',
    location: { tab: 'portfolio', view: 'positions', anchor: 'portfolio.positions' },
    parentId: 'portfolio',
    order: 4,
  },
  'portfolio.growth': {
    id: 'portfolio.growth',
    title: 'Growth',
    summary:
      'Optional portfolio-level perpetual growth rate applied after the last year with explicit inputs (projections, deposits, actions). Compounds the whole book total forward.',
    body: `## How it works

**Perpetual growth after last projection** is a single **% per year on whole portfolio total**.

It runs **after** the last calendar year that still has specific inputs (linked projection years, deposits, or actions). Leave empty or **0** to disable.

> Stock-level paths come from **Saved projection** links on **Positions** — this tab is only the fallback compounding on the **total** after explicit years end.

Use **Chart** **To** year (and **Inputs only** range) to see outer-year bars where perpetual growth applies.

## How to interpret

Perpetual growth does not replace projection-linked revaluation inside stated years — it extends the total when the model would otherwise go flat.

## Example

Last explicit inputs in **2030**; set **3%** perpetual. **Chart To 2035** shows the total climbing **3%** annually on the **2030** end total in **2031–2035** if no new deposits or trades are added.
`,
    status: 'ready',
    location: { tab: 'portfolio', view: 'growth', anchor: 'portfolio.growth' },
    parentId: 'portfolio',
    order: 5,
  },
  'portfolio.goal': {
    id: 'portfolio.goal',
    title: 'Contribution effectiveness',
    summary:
      'Shows how much sooner extra contributions get you to a wealth goal under a compounding rate. Early dollars shorten time-to-goal disproportionately vs later ones — and the absolute years saved loom larger when assumed CAGR is lower.',
    body: `## How it works

Pick a **goal** amount, a **compounding rate** (CAGR), and a **start** (Now, a projected year-end, or a custom amount).

Wealth compounds at that rate each year. Year-end contributions are added with **no growth in the contribution year** (same timing as portfolio Cash deposits).

### Table rows

Each row is cumulative:

- **Base** — start only, no extras
- **+YYYY** — base plus every contribution through that year

For each row you get the goal date, time from the clock origin, how much **faster** that year’s extras are than the previous row, and **relative effectiveness**.

### Extra sources

- **Stated** — pull deposits from the Cash tab after the start year
- **Custom** — what-if only; they never write back to Cash

## How to interpret

> **Earlier contributions count disproportionately more** than later ones of the same size. A dollar that compounds for more years pulls the goal date forward more than a dollar added near the finish.

**Rel. effect.** makes that concrete: exact time saved per currency unit this year, divided by exact time saved per unit in the **last** contribution year (always **1.00×**). Values above 1× mean that year’s money bought more calendar time than the final year’s money.

That imbalance is especially visible when **assumed CAGR is lower**. Growth alone closes less of the gap, so shifting the same contribution earlier saves **more absolute years**. At a higher rate, relative multiples can look larger, but calendar years clawed back from contributing early shrink because compounding already does more of the work.

Use the chart for the whole path; click a table row for the year-by-year math.

## Example

Start **$100k**, goal **$300k**, same **$20k** contribution — only the year and rate change.

### At 4% CAGR

- +$20k in **2026** → about **4.65 years** sooner than base (rel. effect. ≈ **1.59×**)
- +$20k in **2034** → about **2.93 years** sooner than the prior path (rel. effect. **1.00×**)

### At 10% CAGR

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

/** Parent guide from `parentId`, if registered. */
export function getParentGuide(id: FeatureGuideId): FeatureGuide | undefined {
  const guide = getGuide(id)
  if (!guide?.parentId) return undefined
  return getGuide(guide.parentId)
}

/** Root-to-parent chain for breadcrumbs (excludes `id` itself). */
export function getGuideAncestors(id: FeatureGuideId): FeatureGuide[] {
  const ancestors: FeatureGuide[] = []
  let current = getParentGuide(id)
  while (current) {
    ancestors.unshift(current)
    current = getParentGuide(current.id)
  }
  return ancestors
}

/** Direct children of this guide, ordered like the sidebar tree. */
export function listChildGuides(id: FeatureGuideId): FeatureGuide[] {
  return Object.values(GUIDES)
    .filter((g) => g.parentId === id)
    .sort((a, b) => a.order - b.order)
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
