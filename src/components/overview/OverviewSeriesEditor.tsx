import type {
  OverviewSeries,
  OverviewSeriesType,
  SavedPortfolio,
  SavingsAccount,
} from '../../types'
import {
  assignOverviewSeriesColors,
  normalizeHexColor,
  shadesForType,
  sourceLabel,
} from '../../lib/overview'

type Props = {
  series: OverviewSeries[]
  portfolios: SavedPortfolio[]
  savingsAccounts: SavingsAccount[]
  onAdd: (type: OverviewSeriesType) => void
  onUpdate: (id: string, patch: Partial<OverviewSeries>) => void
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}

export function OverviewSeriesEditor({
  series,
  portfolios,
  savingsAccounts,
  onAdd,
  onUpdate,
  onToggle,
  onRemove,
}: Props) {
  const resolvedColors = assignOverviewSeriesColors(series)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-white/50">
            Asset series
          </h3>
          <p className="mt-0.5 text-xs text-white/35">
            Nothing is included automatically. Add portfolios, savings accounts, or manual
            categories (base + yearly %). Toggle to exclude without deleting.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => onAdd('portfolio')}>
            + Portfolio
          </button>
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => onAdd('savings')}>
            + Savings
          </button>
          <button type="button" className="btn-ghost !py-1 !text-xs" onClick={() => onAdd('manual')}>
            + Manual
          </button>
        </div>
      </div>

      {series.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
          Add at least one series to build the net-worth chart.
        </div>
      ) : (
        <div className="space-y-2">
          {series.map((s) => {
            const missing =
              (s.type === 'portfolio' &&
                s.portfolioId &&
                !portfolios.some((p) => p.id === s.portfolioId)) ||
              (s.type === 'savings' &&
                s.savingsAccountId &&
                !savingsAccounts.some((a) => a.id === s.savingsAccountId))
            return (
              <div
                key={s.id}
                className={`grid gap-2 rounded-xl border px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] ${
                  s.enabled
                    ? 'border-white/10 bg-black/20'
                    : 'border-white/5 bg-black/10 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-emerald-500"
                    checked={s.enabled}
                    onChange={() => onToggle(s.id)}
                    title={s.enabled ? 'Included in chart' : 'Excluded from chart'}
                    aria-label={`Include ${s.name}`}
                  />
                  <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/45">
                    {sourceLabel(s.type)}
                  </span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label className="label !mb-0.5 !text-[10px]">Label</label>
                    <input
                      className="input !py-1.5 !text-xs"
                      value={s.name}
                      onChange={(e) => onUpdate(s.id, { name: e.target.value })}
                      placeholder="Series name"
                    />
                  </div>

                  <div>
                    <label className="label !mb-0.5 !text-[10px]">Color</label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        type="color"
                        className="h-8 w-10 cursor-pointer rounded border border-white/10 bg-transparent p-0.5"
                        value={resolvedColors.get(s.id) ?? '#94a3b8'}
                        onChange={(e) =>
                          onUpdate(s.id, { color: normalizeHexColor(e.target.value) })
                        }
                        title="Pick stack color"
                        aria-label={`Color for ${s.name}`}
                      />
                      <div className="flex flex-wrap gap-1">
                        {shadesForType(s.type).slice(0, 6).map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            className={`h-5 w-5 rounded-sm border transition ${
                              (s.color ?? '').toLowerCase() === hex.toLowerCase()
                                ? 'border-white ring-1 ring-white/50'
                                : 'border-white/15 hover:border-white/40'
                            }`}
                            style={{ background: hex }}
                            title={hex}
                            onClick={() => onUpdate(s.id, { color: hex })}
                          />
                        ))}
                      </div>
                      {s.color ? (
                        <button
                          type="button"
                          className="text-[10px] text-white/40 hover:text-white/70"
                          onClick={() => onUpdate(s.id, { color: null })}
                          title="Use automatic color by origin"
                        >
                          Auto
                        </button>
                      ) : (
                        <span className="text-[10px] text-white/30">Auto</span>
                      )}
                    </div>
                  </div>

                  {s.type === 'portfolio' && (
                    <div className="sm:col-span-1 lg:col-span-2">
                      <label className="label !mb-0.5 !text-[10px]">Portfolio</label>
                      <select
                        className="input !py-1.5 !text-xs"
                        value={s.portfolioId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value || null
                          const p = portfolios.find((x) => x.id === id)
                          onUpdate(s.id, {
                            portfolioId: id,
                            name: s.name.trim() ? s.name : p?.name || 'Portfolio',
                          })
                        }}
                      >
                        <option value="">Select portfolio…</option>
                        {portfolios.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {s.type === 'savings' && (
                    <div className="sm:col-span-1 lg:col-span-2">
                      <label className="label !mb-0.5 !text-[10px]">Savings account</label>
                      <select
                        className="input !py-1.5 !text-xs"
                        value={s.savingsAccountId ?? ''}
                        onChange={(e) => {
                          const id = e.target.value || null
                          const a = savingsAccounts.find((x) => x.id === id)
                          onUpdate(s.id, {
                            savingsAccountId: id,
                            name: s.name.trim() ? s.name : a?.name || 'Savings',
                          })
                        }}
                      >
                        <option value="">Select account…</option>
                        {savingsAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name.trim() || 'Untitled'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {s.type === 'manual' && (
                    <>
                      <div>
                        <label className="label !mb-0.5 !text-[10px]">Base (CHF)</label>
                        <input
                          className="input !py-1.5 !text-xs tabular-nums"
                          type="text"
                          inputMode="decimal"
                          value={s.baseChf ? String(s.baseChf) : ''}
                          placeholder="0"
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(/,/g, ''))
                            onUpdate(s.id, {
                              baseChf: Number.isFinite(n) && n >= 0 ? n : 0,
                            })
                          }}
                        />
                      </div>
                      <div>
                        <label className="label !mb-0.5 !text-[10px]">Rate % / year</label>
                        <input
                          className="input !py-1.5 !text-xs tabular-nums"
                          type="text"
                          inputMode="decimal"
                          value={
                            s.annualRatePercent != null && s.annualRatePercent !== 0
                              ? String(s.annualRatePercent)
                              : ''
                          }
                          placeholder="0"
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(/%/g, ''))
                            onUpdate(s.id, {
                              annualRatePercent: Number.isFinite(n) ? n : 0,
                            })
                          }}
                        />
                      </div>
                      <div>
                        <label className="label !mb-0.5 !text-[10px]">Base year</label>
                        <input
                          className="input !py-1.5 !text-xs tabular-nums"
                          type="number"
                          value={s.baseYear ?? new Date().getFullYear()}
                          onChange={(e) =>
                            onUpdate(s.id, {
                              baseYear: Math.floor(Number(e.target.value)) || new Date().getFullYear(),
                            })
                          }
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex items-start justify-end">
                  <button
                    type="button"
                    className="btn-ghost !py-1 !text-xs text-red-300/80"
                    onClick={() => onRemove(s.id)}
                  >
                    Remove
                  </button>
                </div>

                {missing ? (
                  <p className="sm:col-span-3 text-[11px] text-amber-300/90">
                    Linked source is missing — this series contributes 0 until you re-link it.
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
