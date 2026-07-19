import { useEffect, useMemo, useState } from 'react'
import type { SavedPortfolio, SavedScenario } from '../types'
import { buildPortfolioGrid } from '../lib/portfolio'
import { PortfolioHoldingsEditor } from './PortfolioHoldingsEditor'
import { PortfolioValueTable } from './PortfolioValueTable'
import { PortfolioChart } from './PortfolioChart'

type Props = {
  scenarios: SavedScenario[]
  portfolios: SavedPortfolio[]
  storageError: string | null
  createPortfolio: (name?: string) => SavedPortfolio | null
  updatePortfolio: (id: string, patch: Partial<SavedPortfolio>) => boolean
  deletePortfolio: (id: string) => boolean
}

export function PortfolioView({
  scenarios,
  portfolios,
  storageError,
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(
    () => portfolios[0]?.id ?? null,
  )

  useEffect(() => {
    if (selectedId && portfolios.some((p) => p.id === selectedId)) return
    setSelectedId(portfolios[0]?.id ?? null)
  }, [portfolios, selectedId])

  const selected = portfolios.find((p) => p.id === selectedId) ?? null

  const grid = useMemo(() => {
    if (!selected) return null
    return buildPortfolioGrid(selected, scenarios)
  }, [selected, scenarios, selected?.updatedAt])

  function handleCreate() {
    const created = createPortfolio(`Portfolio ${portfolios.length + 1}`)
    if (created) setSelectedId(created.id)
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="card max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Portfolios</h2>
          <button type="button" className="btn-primary !px-2 !py-1 text-xs" onClick={handleCreate}>
            New
          </button>
        </div>
        {storageError && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-xs text-red-300">
            {storageError}
          </p>
        )}
        {portfolios.length === 0 ? (
          <p className="text-sm text-white/40">
            Create a portfolio to allocate dollars across tickers and cash.
          </p>
        ) : (
          <ul className="space-y-1">
            {portfolios.map((p) => {
              const selectedRow = p.id === selectedId
              return (
                <li key={p.id}>
                  <div
                    className={`flex items-center gap-1 rounded-lg border transition ${
                      selectedRow
                        ? 'border-emerald-500/40 bg-emerald-500/10'
                        : 'border-transparent bg-white/[0.03] hover:border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-3 py-2 text-left"
                      onClick={() => setSelectedId(p.id)}
                    >
                      <div className="truncate text-sm font-medium text-white">{p.name}</div>
                      <div className="text-[11px] text-white/40">
                        {p.holdings.length} holding{p.holdings.length === 1 ? '' : 's'}
                        {(p.deposits?.length ?? 0) > 0
                          ? ` · ${p.deposits!.length} deposit${p.deposits!.length === 1 ? '' : 's'}`
                          : ''}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="mr-1 shrink-0 rounded-md px-2 py-1 text-[11px] text-white/40 hover:bg-red-500/20 hover:text-red-300"
                      onClick={() => {
                        if (confirm(`Delete portfolio “${p.name}”?`)) deletePortfolio(p.id)
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </aside>

      <div className="min-w-0 space-y-5">
        {!selected ? (
          <div className="card flex h-64 items-center justify-center p-8 text-sm text-white/40">
            Create or select a portfolio to get started.
          </div>
        ) : (
          <>
            <div className="card p-5">
              <PortfolioHoldingsEditor
                portfolio={selected}
                scenarios={scenarios}
                onChange={(patch) => updatePortfolio(selected.id, patch)}
              />
            </div>

            {grid && (
              <>
                <div className="card p-5">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
                    Portfolio value by year
                  </h3>
                  <PortfolioValueTable grid={grid} />
                </div>
                <div className="card p-5">
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-white/50">
                    Portfolio value over time
                  </h3>
                  <PortfolioChart
                    key={`chart-${selected.id}-${selected.updatedAt}-${grid.rows.map((r) => `${r.key}:${r.label}`).join('|')}`}
                    grid={grid}
                    portfolio={selected}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
