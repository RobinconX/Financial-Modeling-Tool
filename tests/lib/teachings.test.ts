import { describe, expect, it } from 'vitest'
import {
  getGuide,
  getGuideAncestors,
  getParentGuide,
  isGuideReady,
  listChildGuides,
  listGuides,
  listGuideSidebarTree,
  listGuideTree,
} from '../../src/lib/teachings'

describe('teachings registry', () => {
  it('exposes a ready CAGR guide with a selective figure reference', () => {
    const g = getGuide('comparables.cagrChart')
    expect(g?.status).toBe('ready')
    expect(g?.bookUrl).toBeUndefined()
    expect(g?.location).toEqual({
      tab: 'projections',
      view: 'comps',
      anchor: 'comparables.cagrChart',
    })
    expect(g?.parentId).toBe('projections.comps')
    expect(isGuideReady('comparables.cagrChart')).toBe(true)
    expect(g?.references).toEqual([
      expect.objectContaining({
        id: 'cagr-example',
        src: '/guides/comparables-cagr-implied.jpg',
      }),
    ])
    expect(g?.body).toContain('](ref:cagr-example)')
  })

  it('exposes ready Portfolio guides for page and workspace tabs', () => {
    for (const [id, location, parentId] of [
      ['portfolio', { tab: 'portfolio', anchor: 'portfolio' }, null],
      ['portfolio.chart', { tab: 'portfolio', view: 'chart', anchor: 'portfolio.chart' }, 'portfolio'],
      [
        'portfolio.actuals',
        { tab: 'portfolio', view: 'actuals', anchor: 'portfolio.actuals' },
        'portfolio',
      ],
      ['portfolio.cash', { tab: 'portfolio', view: 'cash', anchor: 'portfolio.cash' }, 'portfolio'],
      [
        'portfolio.positions',
        { tab: 'portfolio', view: 'positions', anchor: 'portfolio.positions' },
        'portfolio',
      ],
      [
        'portfolio.growth',
        { tab: 'portfolio', view: 'growth', anchor: 'portfolio.growth' },
        'portfolio',
      ],
    ] as const) {
      const g = getGuide(id)
      expect(g?.status, id).toBe('ready')
      expect(g?.location, id).toEqual(location)
      expect(g?.parentId, id).toBe(parentId)
      expect(isGuideReady(id), id).toBe(true)
      expect(g?.references, id).toBeUndefined()
      expect(g?.body, id).toContain('## Example')
    }
    expect(getGuide('portfolio.chart')?.title).toBe('Chart')
    const portfolioTab = listGuideTree().find((t) => t.tab === 'portfolio')!
    const root = portfolioTab.roots.find((r) => r.guide.id === 'portfolio')!
    expect(root.children.map((c) => c.guide.id)).toEqual([
      'portfolio.chart',
      'portfolio.actuals',
      'portfolio.cash',
      'portfolio.positions',
      'portfolio.growth',
      'portfolio.goal',
    ])
    expect(getGuideAncestors('portfolio.cash').map((g) => g.id)).toEqual(['portfolio'])
  })

  it('exposes a ready contribution-effectiveness guide with a figure', () => {
    const g = getGuide('portfolio.goal')
    expect(g?.status).toBe('ready')
    expect(g?.location).toEqual({
      tab: 'portfolio',
      view: 'goal',
      anchor: 'portfolio.goal',
    })
    expect(g?.parentId).toBe('portfolio')
    expect(isGuideReady('portfolio.goal')).toBe(true)
    expect(g?.references).toEqual([
      expect.objectContaining({
        id: 'contrib-effectiveness',
        src: '/guides/portfolio-contribution-effectiveness.svg',
      }),
    ])
    expect(g?.body).toContain('](ref:contrib-effectiveness)')
    expect(g?.body.toLowerCase()).toContain('disproportionately')
    expect(g?.body.toLowerCase()).toContain('lower')
  })

  it('exposes a ready Budget Monthly guide', () => {
    const g = getGuide('income-cost.monthly')
    expect(g?.status).toBe('ready')
    expect(g?.location).toEqual({
      tab: 'income-cost',
      view: 'monthly',
      anchor: 'income-cost.monthly',
    })
    expect(g?.parentId).toBe('income-cost')
    expect(isGuideReady('income-cost.monthly')).toBe(true)
    expect(g?.references).toBeUndefined()
    expect(g?.body.toLowerCase()).toContain('working')
    expect(g?.body.toLowerCase()).toContain('draw')
  })

  it('exposes ready Savings guides for page and sub-tabs', () => {
    for (const [id, location, parentId] of [
      ['savings', { tab: 'savings', anchor: 'savings' }, null],
      [
        'savings.accounts',
        { tab: 'savings', view: 'inputs', anchor: 'savings.accounts' },
        'savings',
      ],
      [
        'savings.actuals',
        { tab: 'savings', view: 'actuals', anchor: 'savings.actuals' },
        'savings',
      ],
      [
        'savings.progression',
        { tab: 'savings', view: 'projection', anchor: 'savings.progression' },
        'savings',
      ],
    ] as const) {
      const g = getGuide(id)
      expect(g?.status, id).toBe('ready')
      expect(g?.location, id).toEqual(location)
      expect(g?.parentId, id).toBe(parentId)
      expect(isGuideReady(id), id).toBe(true)
      expect(g?.references, id).toBeUndefined()
      expect(g?.body, id).toContain('## Example')
    }
    const savingsTab = listGuideTree().find((t) => t.tab === 'savings')!
    const root = savingsTab.roots.find((r) => r.guide.id === 'savings')!
    expect(root.children.map((c) => c.guide.id)).toEqual([
      'savings.accounts',
      'savings.actuals',
      'savings.progression',
    ])
  })

  it('exposes ready Overview guides for page and sub-features', () => {
    for (const [id, location, parentId] of [
      ['overview', { tab: 'overview', anchor: 'overview' }, null],
      ['overview.scenarios', { tab: 'overview', anchor: 'overview.scenarios' }, 'overview'],
      [
        'overview.chart',
        { tab: 'overview', view: 'networth', anchor: 'overview.chart' },
        'overview',
      ],
      [
        'overview.series',
        { tab: 'overview', view: 'networth', anchor: 'overview.series' },
        'overview',
      ],
    ] as const) {
      const g = getGuide(id)
      expect(g?.status, id).toBe('ready')
      expect(g?.location, id).toEqual(location)
      expect(g?.parentId, id).toBe(parentId)
      expect(isGuideReady(id), id).toBe(true)
      expect(g?.references, id).toBeUndefined()
      expect(g?.body, id).toContain('## Example')
    }
    const overviewTab = listGuideTree().find((t) => t.tab === 'overview')!
    const root = overviewTab.roots.find((r) => r.guide.id === 'overview')!
    expect(root.children.map((c) => c.guide.id)).toEqual([
      'overview.scenarios',
      'overview.chart',
      'overview.series',
      'overview.runway',
    ])
    expect(getGuideAncestors('overview.series').map((g) => g.id)).toEqual(['overview'])
  })

  it('exposes ready Budget guides for page and Budget tab', () => {
    for (const [id, location, parentId] of [
      ['income-cost', { tab: 'income-cost', anchor: 'income-cost' }, null],
      [
        'income-cost.budget',
        { tab: 'income-cost', view: 'budget', anchor: 'income-cost.budget' },
        'income-cost',
      ],
    ] as const) {
      const g = getGuide(id)
      expect(g?.status, id).toBe('ready')
      expect(g?.location, id).toEqual(location)
      expect(g?.parentId, id).toBe(parentId)
      expect(isGuideReady(id), id).toBe(true)
      expect(g?.body, id).toContain('## Example')
    }
    expect(getGuide('income-cost.budget')?.title).toBe('Budget')
    expect(listChildGuides('income-cost').map((g) => g.id)).toEqual([
      'income-cost.budget',
      'income-cost.monthly',
    ])
  })

  it('exposes a ready History page guide with no children', () => {
    const g = getGuide('history')
    expect(g?.status).toBe('ready')
    expect(g?.location).toEqual({ tab: 'history', anchor: 'history' })
    expect(g?.parentId).toBeNull()
    expect(isGuideReady('history')).toBe(true)
    expect(g?.body).toContain('## Example')
    expect(listChildGuides('history')).toEqual([])
    const historyTab = listGuideTree().find((t) => t.tab === 'history')!
    expect(historyTab.roots.map((r) => r.guide.id)).toEqual(['history'])
  })

  it('exposes a ready Overview Runway guide with a figure', () => {
    const g = getGuide('overview.runway')
    expect(g?.status).toBe('ready')
    expect(g?.location).toEqual({
      tab: 'overview',
      anchor: 'overview.runway',
    })
    expect(g?.parentId).toBe('overview')
    expect(g?.order).toBe(4)
    expect(isGuideReady('overview.runway')).toBe(true)
    expect(g?.references).toEqual([
      expect.objectContaining({
        id: 'runway-phase-out',
        src: '/guides/overview-runway-phase-out.svg',
      }),
    ])
    expect(g?.body).toContain('](ref:runway-phase-out)')
    expect(g?.body.toLowerCase()).toContain('phase')
    expect(g?.body.toLowerCase()).toContain('scenario')
    expect(g?.body.toLowerCase()).toContain('sustainable')
    expect(g?.body.toLowerCase()).toContain('financial independence')
  })


  it('exposes ready Projections guides for page, tabs, and chart children', () => {
    for (const [id, location, parentId] of [
      ['projections', { tab: 'projections', anchor: 'projections' }, null],
      [
        'projections.analyze',
        { tab: 'projections', view: 'analyze', anchor: 'projections.analyze' },
        'projections',
      ],
      [
        'projections.comps',
        { tab: 'projections', view: 'comps', anchor: 'projections.comps' },
        'projections',
      ],
    ] as const) {
      const g = getGuide(id)
      expect(g?.status, id).toBe('ready')
      expect(g?.location, id).toEqual(location)
      expect(g?.parentId, id).toBe(parentId)
      expect(isGuideReady(id), id).toBe(true)
      expect(g?.body, id).toContain('## Example')
    }
    expect(getGuide('comparables.upsideChart')?.status).toBe('ready')
    expect(isGuideReady('comparables.upsideChart')).toBe(true)
    expect(getGuide('comparables.upsideChart')?.body.toLowerCase()).toContain('upside')
    const projectionsTab = listGuideTree().find((t) => t.tab === 'projections')!
    const root = projectionsTab.roots.find((r) => r.guide.id === 'projections')!
    expect(root.children.map((c) => c.guide.id)).toEqual([
      'projections.analyze',
      'projections.comps',
    ])
    const comps = root.children.find((c) => c.guide.id === 'projections.comps')!
    expect(comps.children.map((c) => c.guide.id)).toEqual([
      'comparables.cagrChart',
      'comparables.upsideChart',
    ])
  })

  it('exposes ready Settings, portfolio cash, feedback, and release log guides', () => {
    const g = getGuide('settings')
    expect(g?.status).toBe('ready')
    expect(g?.title).toBe('Settings')
    expect(g?.location).toEqual({ tab: 'settings', anchor: 'settings' })
    expect(g?.parentId).toBeNull()
    expect(isGuideReady('settings')).toBe(true)
    expect(g?.body).toContain('## Example')
    expect(g?.body.toLowerCase()).toContain('browser storage')
    expect(g?.body.toLowerCase()).toContain('export')
    expect(g?.body).toContain('skipped')
    expect(getGuide('settings.browser')).toBeUndefined()
    expect(getGuide('settings.linkedFile')).toBeUndefined()
    expect(getGuide('settings.export')).toBeUndefined()
    expect(listChildGuides('settings').map((c) => c.id)).toEqual([
      'settings.portfolio',
      'settings.feedback',
    ])
    const portfolioGroup = getGuide('settings.portfolio')
    expect(portfolioGroup?.status).toBe('ready')
    expect(portfolioGroup?.location).toEqual({
      tab: 'settings',
      anchor: 'settings.portfolio',
    })
    expect(listChildGuides('settings.portfolio').map((c) => c.id)).toEqual([
      'settings.portfolioCash',
      'settings.portfolioActuals',
    ])
    const feedback = getGuide('settings.feedback')
    expect(feedback?.status).toBe('ready')
    expect(feedback?.location).toEqual({ tab: 'settings', anchor: 'settings.feedback' })
    const releaseLog = getGuide('system.releaseLog')
    expect(releaseLog?.status).toBe('ready')
    expect(releaseLog?.location).toEqual({ tab: 'settings', anchor: 'release-log' })
    const settingsTab = listGuideTree().find((t) => t.tab === 'settings')!
    expect(settingsTab.roots.map((r) => r.guide.id)).toEqual(['settings', 'system.releaseLog'])
    const settingsRoot = settingsTab.roots.find((r) => r.guide.id === 'settings')!
    expect(settingsRoot.children.map((c) => c.guide.id)).toEqual([
      'settings.portfolio',
      'settings.feedback',
    ])
    const portfolioNode = settingsRoot.children.find((c) => c.guide.id === 'settings.portfolio')
    expect(portfolioNode?.children.map((c) => c.guide.id)).toEqual([
      'settings.portfolioCash',
      'settings.portfolioActuals',
    ])
  })

  it('treats unknown ids as not ready', () => {
    expect(getGuide('nope')).toBeUndefined()
    expect(isGuideReady('nope')).toBe(false)
  })

  it('pre-registers tab roots with locations', () => {
    for (const id of [
      'projections',
      'portfolio',
      'overview',
      'history',
      'income-cost',
      'savings',
      'settings',
    ] as const) {
      const g = getGuide(id)
      expect(g, id).toBeDefined()
      expect(g!.location.anchor).toBe(id)
      expect(g!.location.tab).toBeTruthy()
    }
  })

  it('builds a nested tree grouped by tab', () => {
    const tree = listGuideTree()
    expect(tree.map((t) => t.tab)).toEqual([
      'overview',
      'income-cost',
      'savings',
      'history',
      'projections',
      'portfolio',
      'settings',
    ])
    const projections = tree.find((t) => t.tab === 'projections')!
    expect(projections.roots.some((r) => r.guide.id === 'projections')).toBe(true)
    const comps = projections.roots
      .flatMap((r) => [r, ...r.children])
      .find((n) => n.guide.id === 'projections.comps')
    expect(comps?.children.map((c) => c.guide.id)).toEqual(
      expect.arrayContaining(['comparables.cagrChart', 'comparables.upsideChart']),
    )
  })

  it('sidebar tree matches Life → Investing → System', () => {
    const sections = listGuideSidebarTree()
    expect(sections.map((s) => s.id)).toEqual(['life', 'investing', 'system'])
    expect(sections[0]!.tabs.map((t) => t.tab)).toEqual([
      'overview',
      'income-cost',
      'savings',
      'history',
    ])
    expect(sections[1]!.tabs.map((t) => t.tab)).toEqual(['projections', 'portfolio'])
  })

  it('listGuides returns every registered entry', () => {
    expect(listGuides().length).toBeGreaterThanOrEqual(20)
  })

  it('resolves parent and children from parentId for article nav', () => {
    expect(getParentGuide('savings')).toBeUndefined()
    expect(listChildGuides('savings').map((g) => g.id)).toEqual([
      'savings.accounts',
      'savings.actuals',
      'savings.progression',
    ])

    expect(getParentGuide('comparables.cagrChart')?.id).toBe('projections.comps')
    expect(listChildGuides('projections.comps').map((g) => g.id)).toEqual(
      expect.arrayContaining(['comparables.cagrChart', 'comparables.upsideChart']),
    )
    expect(listChildGuides('comparables.cagrChart')).toEqual([])
  })

  it('getGuideAncestors returns root-to-parent chain for breadcrumbs', () => {
    expect(getGuideAncestors('savings').map((g) => g.id)).toEqual([])
    expect(getGuideAncestors('savings.actuals').map((g) => g.id)).toEqual(['savings'])
    expect(getGuideAncestors('comparables.cagrChart').map((g) => g.id)).toEqual([
      'projections',
      'projections.comps',
    ])
  })
})

