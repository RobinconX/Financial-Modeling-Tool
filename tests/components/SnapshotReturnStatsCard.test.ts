// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import { SnapshotReturnStatsCard } from '../../src/components/portfolio/PortfolioPerformancePanel'
import { formatMoney } from '../../src/lib/format'

function countButtonsInsideButtons(root: ParentNode): number {
  let nested = 0
  root.querySelectorAll('button').forEach((btn) => {
    const ancestorButton = btn.parentElement?.closest('button')
    if (ancestorButton) nested++
  })
  return nested
}

describe('SnapshotReturnStatsCard', () => {
  let host: HTMLDivElement
  let root: Root

  afterEach(() => {
    root?.unmount()
    host?.remove()
  })

  it('renders metric buttons without nesting inside another button', () => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    act(() => {
      root.render(
        createElement(SnapshotReturnStatsCard, {
          totalPnl: 1200,
          snapshotReturnPct: 0.12,
          currentNet: 10_000,
          grossBuys: 15_000,
          snapshotTwr: { twr: 0.08, status: 'ok' },
          snapshotMwr: { mwr: 0.1, status: 'ok' },
          snapshotMarkNote: null,
          perfFxWarningActive: false,
          fmt: (n) => formatMoney(n, 'USD'),
          onOpenMetric: () => {},
        }),
      )
    })

    expect(host.querySelectorAll('button').length).toBeGreaterThanOrEqual(5)
    expect(countButtonsInsideButtons(host)).toBe(0)
    expect(host.querySelector('[role="group"]')).not.toBeNull()
    expect(host.querySelector('#snapshot-return-today-label')).not.toBeNull()
  })
})