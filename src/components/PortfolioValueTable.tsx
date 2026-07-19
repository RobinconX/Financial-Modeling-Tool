import { formatMoney } from '../lib/format'
import type { PortfolioGrid } from '../types'

type Props = {
  grid: PortfolioGrid
  currency?: string
}

export function PortfolioValueTable({ grid, currency = 'USD' }: Props) {
  if (grid.years.length === 0) {
    return (
      <p className="text-sm text-white/40">
        Add holdings with shares (or cash) to see portfolio values by year.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-white/40">
        Years across the top · positions down the side. Empty equity cells mean no projection that
        year. Cash = current cash + deposits through that year. Total = holdings + cash.
      </p>
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-white/5 text-[11px] uppercase tracking-wider text-white/45">
            <tr>
              <th className="sticky left-0 z-10 bg-[#141a22] px-3 py-2 font-medium">Position</th>
              {grid.years.map((y) => (
                <th key={y} className="px-3 py-2 font-medium tabular-nums">
                  {y}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr
                key={`${row.key}::${row.label}`}
                className={`border-t border-white/5 ${
                  row.kind === 'total'
                    ? 'bg-emerald-500/10 font-semibold'
                    : row.kind === 'cash'
                      ? 'bg-white/[0.02]'
                      : ''
                }`}
              >
                <td className="sticky left-0 z-10 bg-[#0f141b] px-3 py-2">
                  <div
                    className={row.kind === 'total' ? 'text-emerald-300' : 'text-white/90'}
                    title={row.label}
                  >
                    {row.label}
                  </div>
                  {row.warning && (
                    <div className="text-[11px] text-amber-300/90">{row.warning}</div>
                  )}
                </td>
                {row.values.map((v, i) => (
                  <td
                    key={`${row.key}-${grid.years[i]}`}
                    className={`px-3 py-2 tabular-nums ${
                      row.kind === 'total' ? 'text-emerald-300' : 'text-white/80'
                    }`}
                  >
                    {v == null ? (
                      <span className="text-white/20">—</span>
                    ) : (
                      formatMoney(v, currency)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
