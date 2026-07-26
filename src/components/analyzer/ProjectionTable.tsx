import { formatMoney, formatPercent, formatPrice } from '../../lib/format'
import { impliedSharePrice } from '../../lib/sharePrice'
import type { ProjectionRow } from '../../types'

const BASIS_LABEL: Record<string, string> = {
  easy: 'Easy',
  ps: 'P/S',
  pfcf: 'P/FCF',
  pe: 'P/E',
}

type Props = {
  rows: ProjectionRow[]
  currency?: string
  sharesOutstanding?: number | null
}

export function ProjectionTable({
  rows,
  currency = 'USD',
  sharesOutstanding = null,
}: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-white/40">No projection rows yet — fill in the inputs above.</p>
    )
  }

  const showDilution = rows.some((r) => r.basis !== 'easy' && Math.abs(r.dilutionFactor - 1) >= 1e-9)
  const showPrice = sharesOutstanding != null && sharesOutstanding > 0

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[480px] text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wider text-white/45">
          <tr>
            <th className="px-3 py-2 font-medium">Year</th>
            <th className="px-3 py-2 font-medium">Basis</th>
            <th className="px-3 py-2 font-medium">Implied mcap</th>
            {showPrice && <th className="px-3 py-2 font-medium">Share price</th>}
            {showDilution && (
              <>
                <th className="px-3 py-2 font-medium">Dilution</th>
                <th className="px-3 py-2 font-medium">Equity value</th>
              </>
            )}
            <th className="px-3 py-2 font-medium">Total return</th>
            <th className="px-3 py-2 font-medium">ROI p.a.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const px = showPrice
              ? impliedSharePrice(row.equityValue, sharesOutstanding)
              : null
            return (
              <tr
                key={`${row.basis}-${row.year}`}
                className="border-t border-white/5 text-white/85"
              >
                <td className="px-3 py-2 tabular-nums">{row.year}</td>
                <td className="px-3 py-2">{BASIS_LABEL[row.basis] ?? row.basis}</td>
                <td className="px-3 py-2 tabular-nums">{formatMoney(row.marketCap, currency)}</td>
                {showPrice && (
                  <td className="px-3 py-2 tabular-nums text-white/80">
                    {formatPrice(px, currency)}
                  </td>
                )}
                {showDilution && (
                  <>
                    <td className="px-3 py-2 tabular-nums text-white/70">
                      {row.basis === 'easy' || Math.abs(row.dilutionFactor - 1) < 1e-9
                        ? '—'
                        : `${row.dilutionFactor.toFixed(2)}×`}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {row.basis === 'easy' || Math.abs(row.dilutionFactor - 1) < 1e-9
                        ? '—'
                        : formatMoney(row.equityValue, currency)}
                    </td>
                  </>
                )}
                <td className="px-3 py-2 tabular-nums">{formatPercent(row.totalReturn)}</td>
                <td
                  className={`px-3 py-2 font-semibold tabular-nums ${
                    row.cagr >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {formatPercent(row.cagr)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
