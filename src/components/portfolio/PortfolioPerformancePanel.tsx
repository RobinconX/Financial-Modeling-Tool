import { useEffect, useMemo, useState } from 'react'
import type { PortfolioTrade, PortfolioTradesState, SavedPortfolio, SavedScenario } from '../../types'
import { formatMoney } from '../../lib/format'
import {
  computePortfolioPerformance,
  newPortfolioTrade,
  tradedSymbolsFromTrades,
  tradesForPortfolio,
  tradesMatchingSymbol,
} from '../../lib/portfolioTrades'
import { FeatureGuideButton } from '../guides/FeatureGuideButton'
import { PortfolioTradeDrawer } from './PortfolioTradeDrawer'
import { ConfirmDialog } from '../common/ConfirmDialog'

type Props = {
  portfolio: SavedPortfolio
  tradesState: PortfolioTradesState
  tradesError: string | null
  scenarios: SavedScenario[]
  onSaveTrade: (trade: PortfolioTrade) => boolean
  onDeleteTrade: (tradeId: string) => boolean
  /** When user clicks Log trade on Positions, open drawer with this symbol. */
  logTradeSeed?: { symbol: string; holdingId?: string } | null
  onClearLogTradeSeed?: () => void
}

function pct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toFixed(1)}%`
}

function pnlClass(v: number): string {
  if (v > 0) return 'text-emerald-300/90'
  if (v < 0) return 'text-red-300/90'
  return 'text-white/70'
}

export function PortfolioPerformancePanel({
  portfolio,
  tradesState,
  tradesError,
  scenarios,
  onSaveTrade,
  onDeleteTrade,
  logTradeSeed,
  onClearLogTradeSeed,
}: Props) {
  const portfolioTrades = useMemo(
    () => tradesForPortfolio(tradesState, portfolio.id),
    [tradesState, portfolio.id],
  )
  const tradedSymbols = useMemo(
    () => tradedSymbolsFromTrades(portfolioTrades),
    [portfolioTrades],
  )
  const [scopeSymbol, setScopeSymbol] = useState<string | null>(null)

  useEffect(() => {
    setScopeSymbol(null)
  }, [portfolio.id])

  useEffect(() => {
    if (scopeSymbol && !tradedSymbols.includes(scopeSymbol)) {
      setScopeSymbol(null)
    }
  }, [scopeSymbol, tradedSymbols])

  const scopedTrades = useMemo(
    () => tradesMatchingSymbol(portfolioTrades, scopeSymbol),
    [portfolioTrades, scopeSymbol],
  )
  const summary = useMemo(
    () => computePortfolioPerformance(scopedTrades, portfolio, scenarios),
    [scopedTrades, portfolio, scenarios],
  )

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [draft, setDraft] = useState<PortfolioTrade | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PortfolioTrade | null>(null)

  const openNew = (symbol?: string, holdingId?: string) => {
    setDraft(
      newPortfolioTrade(portfolio.id, {
        symbol: symbol ?? '',
        holdingId,
      }),
    )
    setDrawerOpen(true)
  }

  useEffect(() => {
    if (!logTradeSeed?.symbol) return
    setDraft(
      newPortfolioTrade(portfolio.id, {
        symbol: logTradeSeed.symbol,
        holdingId: logTradeSeed.holdingId,
      }),
    )
    setDrawerOpen(true)
    onClearLogTradeSeed?.()
  }, [logTradeSeed, onClearLogTradeSeed, portfolio.id])

  const openEdit = (trade: PortfolioTrade) => {
    setDraft({ ...trade })
    setDrawerOpen(true)
  }

  return (
    <div className="space-y-5" data-guide-anchor="portfolio.performance">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-white">Performance</h3>
              <FeatureGuideButton id="portfolio.performance" />
            </div>
            {tradedSymbols.length > 0 ? (
              <select
                className="input !w-auto max-w-[11rem] !py-1 !text-xs tabular-nums"
                value={scopeSymbol ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setScopeSymbol(v ? v : null)
                }}
                aria-label="Performance scope"
              >
                <option value="">Whole portfolio</option>
                {tradedSymbols.map((sym) => (
                  <option key={sym} value={sym}>
                    {sym}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="btn-primary !px-2.5 !py-1 !text-xs"
              onClick={() => openNew(scopeSymbol ?? undefined)}
            >
              + Trade
            </button>
          </div>
          <p className="mt-1 text-xs text-white/45">
            {scopeSymbol
              ? `Trades and P&L for ${scopeSymbol} on this book.`
              : 'All traded symbols on this book (incl. closed). Ledger does not change Positions.'}
          </p>
        </div>
      </div>

      {tradesError ? (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {tradesError}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            { label: 'Realized P&L', value: summary.realizedPnl },
            { label: 'Unrealized P&L', value: summary.unrealizedPnl },
            { label: 'Total P&L', value: summary.totalPnl },
            { label: 'Return on buys', value: summary.returnPct, isPct: true },
          ] as const
        ).map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {card.label}
            </p>
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${
                'isPct' in card && card.isPct
                  ? 'text-white'
                  : pnlClass(card.value as number)
              }`}
            >
              {'isPct' in card && card.isPct
                ? pct(card.value as number | null)
                : formatMoney(card.value as number, 'USD')}
            </p>
          </div>
        ))}
      </div>

      {summary.symbols.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-300/80">
            By symbol
          </h4>
          <div className="table-shell overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-white/45">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Symbol</th>
                  <th className="px-3 py-2 text-right font-medium">Ledger sh.</th>
                  <th className="px-3 py-2 text-right font-medium">Realized</th>
                  <th className="px-3 py-2 text-right font-medium">Unrealized</th>
                  <th className="px-3 py-2 text-right font-medium">Return</th>
                </tr>
              </thead>
              <tbody>
                {summary.symbols.map((s) => (
                  <tr key={s.symbol} className="border-t border-white/5">
                    <td className="px-3 py-2 font-medium text-white">{s.symbol}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/80">
                      {s.ledgerShares > 0 ? formatInputShares(s.ledgerShares) : '0'}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${pnlClass(s.realizedPnl)}`}>
                      {formatMoney(s.realizedPnl, 'USD')}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        s.unrealizedPnl != null ? pnlClass(s.unrealizedPnl) : 'text-white/40'
                      }`}
                    >
                      {s.unrealizedPnl != null
                        ? formatMoney(s.unrealizedPnl, 'USD')
                        : s.ledgerShares > 0
                          ? 'No mark'
                          : '—'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-white/80">
                      {pct(s.returnPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-sky-300/80">
          Trade log
        </h4>
        {scopedTrades.length === 0 ? (
          <p className="text-sm text-white/40">
            No trades yet. Use **+ Trade** or paste trades into your save file under{' '}
            <code className="text-emerald-300/80">portfolioTrades</code>.
          </p>
        ) : (
          <div className="table-shell overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-white/45">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  {!scopeSymbol ? (
                    <th className="px-3 py-2 text-left font-medium">Symbol</th>
                  ) : null}
                  <th className="px-3 py-2 text-left font-medium">Side</th>
                  <th className="px-3 py-2 text-right font-medium">Shares</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Fees</th>
                  <th className="px-3 py-2 text-right font-medium" />
                </tr>
              </thead>
              <tbody>
                {[...scopedTrades]
                  .sort((a, b) => b.tradeDate.localeCompare(a.tradeDate))
                  .map((t) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="px-3 py-2 tabular-nums text-white/80">{t.tradeDate}</td>
                      {!scopeSymbol ? (
                        <td className="px-3 py-2 font-medium text-white">{t.symbol}</td>
                      ) : null}
                      <td className="px-3 py-2 capitalize">
                        <span
                          className={
                            t.side === 'buy' ? 'text-emerald-300/85' : 'text-red-300/85'
                          }
                        >
                          {t.side}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/80">
                        {formatInputShares(t.shares)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/80">
                        {formatMoney(t.price, 'USD')}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/50">
                        {(t.fees ?? 0) > 0 ? formatMoney(t.fees!, 'USD') : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          className="mr-2 text-[11px] text-sky-300/80 hover:text-sky-200"
                          onClick={() => openEdit(t)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-[11px] text-red-300/70 hover:text-red-200"
                          onClick={() => setPendingDelete(t)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <PortfolioTradeDrawer
        open={drawerOpen}
        draft={draft}
        onClose={() => {
          setDrawerOpen(false)
          setDraft(null)
        }}
        onSave={onSaveTrade}
      />

      {pendingDelete ? (
        <ConfirmDialog
          title="Delete trade?"
          confirmLabel="Delete"
          onClose={() => setPendingDelete(null)}
          onConfirm={() => {
            onDeleteTrade(pendingDelete.id)
            setPendingDelete(null)
          }}
        >
          <p>
            Remove {pendingDelete.side} {formatInputShares(pendingDelete.shares)}{' '}
            {pendingDelete.symbol} on {pendingDelete.tradeDate}?
          </p>
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

function formatInputShares(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(4).replace(/\.?0+$/, '')
}