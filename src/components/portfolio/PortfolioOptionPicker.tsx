import { useMemo, useState } from 'react'
import type { OptionContract, SavedScenario } from '../../types'
import { fetchOptionChainClient, type OptionChainContract } from '../../lib/options'
import { formatPrice } from '../../lib/format'

type Props = {
  scenarios: SavedScenario[]
  onAdd: (contract: OptionContract, premium: number | null) => void
  onClose: () => void
}

function premiumOf(c: OptionChainContract): number | null {
  if (c.last != null && c.last > 0) return c.last
  if (c.bid != null && c.ask != null && c.bid > 0 && c.ask > 0) return (c.bid + c.ask) / 2
  if (c.ask != null && c.ask > 0) return c.ask
  if (c.bid != null && c.bid > 0) return c.bid
  return null
}

export function PortfolioOptionPicker({ scenarios, onAdd, onClose }: Props) {
  const underlyings = useMemo(
    () => [...new Set(scenarios.map((s) => s.symbol.toUpperCase()).filter(Boolean))].sort(),
    [scenarios],
  )
  const [underlying, setUnderlying] = useState(underlyings[0] ?? '')
  const [draftUnderlying, setDraftUnderlying] = useState(underlyings[0] ?? '')
  const [expirations, setExpirations] = useState<string[]>([])
  const [expiration, setExpiration] = useState('')
  const [right, setRight] = useState<'C' | 'P'>('C')
  const [calls, setCalls] = useState<OptionChainContract[]>([])
  const [puts, setPuts] = useState<OptionChainContract[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const rows = right === 'C' ? calls : puts

  async function loadChain(sym: string, date?: string) {
    const ticker = sym.trim().toUpperCase()
    if (!/^[A-Z]{1,6}$/.test(ticker)) {
      setError('Underlying must be a ticker (1–6 letters)')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const chain = await fetchOptionChainClient(ticker, date || null)
      setUnderlying(chain.underlying)
      setDraftUnderlying(chain.underlying)
      setExpirations(chain.expirations)
      const exp = chain.expiration ?? chain.expirations[0] ?? ''
      setExpiration(exp)
      setCalls(chain.calls)
      setPuts(chain.puts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chain')
      setCalls([])
      setPuts([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-white/55">
          Add listed option
        </h4>
        <button type="button" className="text-[11px] text-white/40 hover:text-white/70" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-white/50">
          Underlying
          <input
            className="input mt-0.5 !w-[7rem] !py-1 !text-xs"
            value={draftUnderlying}
            list="option-underlyings"
            onChange={(e) => setDraftUnderlying(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void loadChain(draftUnderlying)
            }}
          />
        </label>
        <datalist id="option-underlyings">
          {underlyings.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="button"
          className="btn-ghost !py-1 !text-[11px]"
          onClick={() => void loadChain(draftUnderlying)}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load chain'}
        </button>
        {expirations.length > 0 ? (
          <label className="text-xs text-white/50">
            Expiry
            <select
              className="input mt-0.5 !w-auto !py-1 !text-xs"
              value={expiration}
              onChange={(e) => {
                const next = e.target.value
                setExpiration(next)
                void loadChain(underlying || draftUnderlying, next)
              }}
            >
              {expirations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <div
          className="inline-flex gap-1 border-b border-white/10"
          role="group"
          aria-label="Call or put"
        >
          {(['C', 'P'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`-mb-px border-b-2 px-2 py-0.5 text-[11px] font-medium ${
                right === r
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-white/50 hover:text-white/80'
              }`}
              onClick={() => setRight(r)}
            >
              {r === 'C' ? 'Calls' : 'Puts'}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="mt-2 text-[11px] text-red-300">{error}</p> : null}
      {rows.length > 0 ? (
        <div className="mt-2 max-h-56 overflow-auto rounded-md border border-white/10">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-[#121820] text-white/40">
              <tr>
                <th className="px-2 py-1 font-medium">Strike</th>
                <th className="px-2 py-1 font-medium">Last</th>
                <th className="px-2 py-1 font-medium">Bid</th>
                <th className="px-2 py-1 font-medium">Ask</th>
                <th className="px-2 py-1" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.occSymbol}
                  className="cursor-pointer border-t border-white/5 text-white/75 transition hover:bg-emerald-500/15 hover:text-white"
                  onClick={() =>
                    onAdd(
                      {
                        underlying,
                        expiration,
                        right: c.right,
                        strike: c.strike,
                        multiplier: 100,
                        occSymbol: c.occSymbol,
                      },
                      premiumOf(c),
                    )
                  }
                >
                  <td className="px-2 py-1.5 tabular-nums font-medium">{c.strike}</td>
                  <td className="px-2 py-1.5 tabular-nums">{c.last != null ? formatPrice(c.last) : '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{c.bid != null ? formatPrice(c.bid) : '—'}</td>
                  <td className="px-2 py-1.5 tabular-nums">{c.ask != null ? formatPrice(c.ask) : '—'}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-300/90">Add</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading && expirations.length === 0 ? (
        <p className="mt-2 text-[11px] text-white/35">
          Enter a ticker and load the chain (delayed Nasdaq data).
        </p>
      ) : null}
    </div>
  )
}
