import { describe, expect, it } from 'vitest'
import {
  getGuide,
  isGuideReady,
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

  it('exposes a ready Overview Runway guide with a figure', () => {
    const g = getGuide('overview.runway')
    expect(g?.status).toBe('ready')
    expect(g?.location).toEqual({
      tab: 'overview',
      anchor: 'overview.runway',
    })
    expect(g?.parentId).toBe('overview')
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


  it('keeps upside chart draft (in-app button hidden; registry still opens stub)', () => {
    expect(getGuide('comparables.upsideChart')?.status).toBe('draft')
    expect(isGuideReady('comparables.upsideChart')).toBe(false)
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
})

