import { describe, expect, it } from 'vitest'
import chartSrc from '../../src/components/portfolio/PortfolioChart.tsx?raw'

/** Hooks that used to sit below the empty-state return; keep them above `if (isEmpty)`. */
const HOOKS_BEFORE_EMPTY = [
  'const tickKeys = useMemo',
  'const handleChartHover = useCallback',
  'const handleChartClick = useCallback',
] as const

describe('PortfolioChart hook order', () => {
  it('declares chart hooks before the empty-state early return', () => {
    const fn = chartSrc.indexOf('export function PortfolioChart')
    expect(fn).toBeGreaterThan(-1)
    const body = chartSrc.slice(fn)
    const emptyIdx = body.indexOf('if (isEmpty)')
    expect(emptyIdx).toBeGreaterThan(-1)

    const beforeEmpty = body.slice(0, emptyIdx)
    for (const needle of HOOKS_BEFORE_EMPTY) {
      expect(beforeEmpty).toContain(needle)
    }

    const afterEmpty = body.slice(emptyIdx)
    const mainReturn = afterEmpty.indexOf('return (\n    <div')
    const between = afterEmpty.slice(0, mainReturn > 0 ? mainReturn : afterEmpty.length)
    expect(between).not.toMatch(/\buse(?:Memo|Callback|Effect|LayoutEffect)\(/)
  })
})