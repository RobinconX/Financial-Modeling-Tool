import { useState } from 'react'
import { ReferenceDot, ReferenceLine } from 'recharts'
import type { NetWorthGoal } from '../../types'
import { formatMoney } from '../../lib/format'
import { goalMarkXKey, parseGoalAmount } from '../../lib/goals'

function GoalStar({
  cx = 0,
  cy = 0,
}: {
  cx?: number
  cy?: number
}) {
  return (
    <path
      transform={`translate(${cx},${cy})`}
      d="M0,-6 L1.7,-1.9 L6,-1.5 L2.6,1.3 L3.7,5.6 L0,3.3 L-3.7,5.6 L-2.6,1.3 L-6,-1.5 L-1.7,-1.9 Z"
      fill="#c4b5fd"
      stroke="rgba(18,24,32,0.55)"
      strokeWidth={0.8}
    />
  )
}

export function ChartGoalLines({
  goals,
  xKeys,
}: {
  goals: NetWorthGoal[]
  xKeys: string[]
}) {
  return (
    <>
      {goals.map((g) => {
        const label = g.name.trim() || formatMoney(g.amountChf, 'CHF')
        return (
          <ReferenceLine
            key={`${g.id}-line`}
            y={g.amountChf}
            stroke="rgba(196, 181, 253, 0.7)"
            strokeWidth={1.25}
            ifOverflow="hidden"
            label={{
              value: label,
              fill: 'rgba(196, 181, 253, 0.85)',
              fontSize: 10,
              position: 'insideTopRight',
            }}
          />
        )
      })}
      {goals.map((g) => {
        const x = goalMarkXKey(g.year, xKeys)
        if (!x) return null
        return (
          <ReferenceDot
            key={`${g.id}-star`}
            x={x}
            y={g.amountChf}
            r={6}
            ifOverflow="hidden"
            shape={GoalStar}
          />
        )
      })}
    </>
  )
}

type Props = {
  goals: NetWorthGoal[]
  error?: string | null
  defaultYear: number
  show: boolean
  onShowChange: (show: boolean) => void
  onAdd: (year: number, amountChf: number, name: string) => void
  onUpdate: (id: string, patch: Partial<Pick<NetWorthGoal, 'year' | 'amountChf' | 'name'>>) => void
  onRemove: (id: string) => void
  /** When false, the Show Goals checkbox is omitted (parent renders it). */
  showToggle?: boolean
}

function GoalRow({
  goal,
  onUpdate,
  onRemove,
}: {
  goal: NetWorthGoal
  onUpdate: Props['onUpdate']
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [yearDraft, setYearDraft] = useState(String(goal.year))
  const [amountDraft, setAmountDraft] = useState(String(goal.amountChf))
  const [nameDraft, setNameDraft] = useState(goal.name)

  function save() {
    const year = Number(yearDraft)
    const amount = parseGoalAmount(amountDraft)
    if (!Number.isFinite(year) || year < 1900 || year > 2200) return
    if (amount == null || !(amount > 0)) return
    onUpdate(goal.id, { year: Math.floor(year), amountChf: amount, name: nameDraft })
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2 text-white/65">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-white/85"
          onClick={() => setEditing(true)}
        >
          <span className="w-10 shrink-0 tabular-nums text-white/40">{goal.year}</span>
          <span className="shrink-0 tabular-nums">{formatMoney(goal.amountChf, 'CHF')}</span>
          {goal.name ? <span className="min-w-0 truncate text-white/45">{goal.name}</span> : null}
        </button>
        <button
          type="button"
          className="shrink-0 text-white/30 hover:text-red-300/80"
          onClick={() => onRemove(goal.id)}
          aria-label={`Remove goal ${goal.name || goal.year}`}
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        className="input !w-[4.5rem] !py-0.5 !text-[11px] tabular-nums"
        type="number"
        value={yearDraft}
        onChange={(e) => setYearDraft(e.target.value)}
        aria-label="Goal year"
      />
      <input
        className="input !w-24 !py-0.5 !text-[11px] tabular-nums"
        value={amountDraft}
        onChange={(e) => setAmountDraft(e.target.value)}
        aria-label="Goal amount CHF"
      />
      <input
        className="input !w-28 !py-0.5 !text-[11px]"
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        placeholder="Name"
        maxLength={40}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') setEditing(false)
        }}
        aria-label="Goal name"
      />
      <button type="button" className="btn-ghost !py-0.5 !text-[11px]" onClick={save}>
        Save
      </button>
      <button
        type="button"
        className="btn-ghost !py-0.5 !text-[11px]"
        onClick={() => setEditing(false)}
      >
        Cancel
      </button>
    </div>
  )
}

export function ChartGoals({
  goals,
  error,
  defaultYear,
  show,
  onShowChange,
  onAdd,
  onUpdate,
  onRemove,
  showToggle = true,
}: Props) {
  const [open, setOpen] = useState(false)
  const [yearDraft, setYearDraft] = useState(String(defaultYear))
  const [amountDraft, setAmountDraft] = useState('')
  const [nameDraft, setNameDraft] = useState('')

  function submit() {
    const year = Number(yearDraft)
    const amount = parseGoalAmount(amountDraft)
    if (!Number.isFinite(year) || year < 1900 || year > 2200 || amount == null) return
    onAdd(Math.floor(year), amount, nameDraft.trim())
    setAmountDraft('')
    setNameDraft('')
  }

  return (
    <div className="min-w-0 flex-1 text-[11px] text-white/50">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="text-white/45 hover:text-white/75"
          onClick={() => setOpen((v) => !v)}
        >
          Goals{goals.length > 0 ? ` · ${goals.length}` : ''}
        </button>
        {showToggle && goals.length > 0 ? (
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 text-white/55 hover:text-white/80">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-violet-400"
              checked={show}
              onChange={() => onShowChange(!show)}
            />
            Show Goals
          </label>
        ) : null}
      </div>
      {open ? (
        <div className="mt-1.5 space-y-1">
          {goals.map((g) => (
            <GoalRow key={g.id} goal={g} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <input
              className="input !w-[4.5rem] !py-0.5 !text-[11px] tabular-nums"
              type="number"
              value={yearDraft}
              onChange={(e) => setYearDraft(e.target.value)}
              aria-label="New goal year"
            />
            <input
              className="input !w-24 !py-0.5 !text-[11px] tabular-nums"
              value={amountDraft}
              onChange={(e) => setAmountDraft(e.target.value)}
              placeholder="2M"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              aria-label="New goal amount CHF"
            />
            <input
              className="input !w-28 !py-0.5 !text-[11px]"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              placeholder="Name (opt.)"
              maxLength={40}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              aria-label="New goal name"
            />
            <button type="button" className="btn-ghost !py-0.5 !text-[11px]" onClick={submit}>
              Add
            </button>
          </div>
          {error ? <p className="text-red-300/80">{error}</p> : null}
        </div>
      ) : null}
    </div>
  )
}