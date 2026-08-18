import { useState } from 'react'
import type { DisplayCurrency, PortfolioContributionsState } from '../../types'
import { parseMoney } from '../../lib/format'
import { amountToDisplay } from '../../lib/fx'
import { contributionYears } from '../../lib/portfolioContributions'
import { InfoTip } from '../common/InfoTip'

type Props = {
  contributions: PortfolioContributionsState
  error: string | null
  displayCurrency: DisplayCurrency
  usdToChf: number | null
  currentYear: number
  onSetYear: (year: number, amount: number | null) => void
  onSetCurrency: (currency: DisplayCurrency) => void
}

function storedToDisplay(
  amount: number,
  from: DisplayCurrency,
  to: DisplayCurrency,
  usdToChf: number | null,
): number | null {
  if (from === to) return amount
  if (usdToChf == null || usdToChf <= 0) return null
  return amountToDisplay(amount, from, to, usdToChf)
}

function displayToStored(
  amount: number,
  display: DisplayCurrency,
  stored: DisplayCurrency,
  usdToChf: number | null,
): number | null {
  if (display === stored) return amount
  if (usdToChf == null || usdToChf <= 0) return null
  return amountToDisplay(amount, display, stored, usdToChf)
}

export function PortfolioMoneyIn({
  contributions,
  error,
  displayCurrency,
  usdToChf,
  currentYear,
  onSetYear,
  onSetCurrency,
}: Props) {
  const years = contributionYears(contributions)
  const editCurrency: DisplayCurrency =
    contributions.currency === displayCurrency || (usdToChf != null && usdToChf > 0)
      ? displayCurrency
      : contributions.currency

  const [addYear, setAddYear] = useState(String(currentYear))
  const [draftYears, setDraftYears] = useState<number[]>([])
  const listed = [...new Set([...years, ...draftYears])].sort((a, b) => a - b)

  function commitYear(year: number, raw: string) {
    const parsed = parseMoney(raw.trim())
    if (parsed == null || !(parsed > 0)) {
      onSetYear(year, null)
      setDraftYears((ds) => ds.filter((d) => d !== year))
      return
    }
    if (years.length === 0 && contributions.currency !== editCurrency) {
      onSetCurrency(editCurrency)
    }
    const stored =
      years.length === 0
        ? parsed
        : displayToStored(parsed, editCurrency, contributions.currency, usdToChf)
    if (stored == null) return
    onSetYear(year, stored)
    setDraftYears((ds) => ds.filter((d) => d !== year))
  }

  function add() {
    const y = Math.floor(Number(addYear))
    if (!Number.isFinite(y) || y < 1900 || y > 2200) return
    if (listed.includes(y)) return
    setDraftYears((ds) => [...ds, y])
    if (years.length === 0) onSetCurrency(editCurrency)
  }

  return (
    <div className="space-y-4">
      <div className="section-header">
        <div className="flex items-center gap-1.5">
          <h3 className="section-title text-emerald-300/90">Money in</h3>
          <InfoTip label="About money in">
            Actual contributions you added. One list for every portfolio scenario. Used only
            to compute ROI (chart hover and value table). Does not change cash or planned
            deposits. Future-year ROI also includes that portfolio’s planned deposits.
          </InfoTip>
        </div>
        <span className="text-[11px] text-white/35">All scenarios · {editCurrency}</span>
      </div>

      {error ? (
        <p className="text-xs text-red-300">{error}</p>
      ) : null}

      <div className="space-y-1.5">
        {listed.length === 0 ? (
          <p className="text-[11px] text-white/35">No contributions recorded yet.</p>
        ) : (
          listed.map((y) => {
            const stored = contributions.byYear[String(y)]
            const shown =
              stored != null
                ? storedToDisplay(stored, contributions.currency, editCurrency, usdToChf)
                : null
            return (
              <div key={y} className="flex flex-wrap items-center gap-2">
                <span className="w-14 tabular-nums text-xs text-white/55">{y}</span>
                <input
                  className="input !w-[8.5rem] !py-1 !text-xs tabular-nums"
                  defaultValue={shown != null ? String(shown) : ''}
                  key={`${y}-${shown ?? 'new'}-${editCurrency}`}
                  onBlur={(e) => commitYear(y, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                  }}
                />
                <button
                  type="button"
                  className="text-[11px] text-white/35 hover:text-red-300"
                  onClick={() => {
                    onSetYear(y, null)
                    setDraftYears((ds) => ds.filter((d) => d !== y))
                  }}
                >
                  Remove
                </button>
              </div>
            )
          })
        )}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            className="input !w-[5.5rem] !py-1 !text-xs tabular-nums"
            type="number"
            value={addYear}
            onChange={(e) => setAddYear(e.target.value)}
            aria-label="Year to add"
          />
          <button type="button" className="btn-ghost !py-1 !text-[11px]" onClick={add}>
            + Year
          </button>
        </div>
      </div>
    </div>
  )
}
