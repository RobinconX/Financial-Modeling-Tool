import { useState } from 'react'
import type { ChartAnnotation } from '../../types'
import { notesByMarkKey } from '../../lib/annotations'

type TickProps = {
  x?: string | number
  y?: string | number
  payload?: { value?: string | number }
}

/** Small mark beside a year tick; hover shows the note text. */
export function chartYearTick(
  notes: ChartAnnotation[],
  xKeys: string[],
  hideLabel?: (key: string) => boolean,
) {
  const byKey = notesByMarkKey(notes, xKeys)
  return function ChartYearTick({ x = 0, y = 0, payload }: TickProps) {
    const tx = Number(x) || 0
    const ty = Number(y) || 0
    const key = String(payload?.value ?? '')
    const here = byKey.get(key) ?? []
    const isNow = key === 'now'
    const hide = !isNow && here.length === 0 && hideLabel?.(key) === true
    const text = isNow ? 'Now' : hide ? '' : key
    const half = text.length * 3.15
    return (
      <g transform={`translate(${tx},${ty})`} style={{ pointerEvents: 'auto' }}>
        {text ? (
          <text
            textAnchor="middle"
            dy={12}
            fill="rgba(232,238,245,0.45)"
            fontSize={11}
          >
            {text}
          </text>
        ) : null}
        {here.length > 0 ? (
          <g
            className="group/ann"
            transform={`translate(${half + 5}, 8)`}
            style={{ pointerEvents: 'auto' }}
          >
            <circle r={3} fill="#fbbf24" />
            <title>{here.map((n) => n.label).join('\n')}</title>
            <g className="pointer-events-none opacity-0 group-hover/ann:opacity-100">
              <rect
                x={6}
                y={-10 - here.length * 13}
                width={Math.min(
                  180,
                  Math.max(...here.map((n) => n.label.length * 6.2 + 14)),
                )}
                height={here.length * 13 + 8}
                rx={4}
                fill="#121820"
                stroke="rgba(255,255,255,0.12)"
              />
              {here.map((n, i) => (
                <text
                  key={n.id}
                  x={12}
                  y={-here.length * 13 + 8 + i * 13}
                  fill="#fde68a"
                  fontSize={10}
                >
                  {n.label}
                </text>
              ))}
            </g>
          </g>
        ) : null}
      </g>
    )
  }
}

type Props = {
  annotations: ChartAnnotation[]
  error?: string | null
  defaultYear: number
  onAdd: (year: number, label: string) => void
  onUpdate: (id: string, patch: { year?: number; label?: string }) => void
  onRemove: (id: string) => void
}

function NoteRow({
  note,
  onUpdate,
  onRemove,
}: {
  note: ChartAnnotation
  onUpdate: (id: string, patch: { year?: number; label?: string }) => void
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [yearDraft, setYearDraft] = useState(String(note.year))
  const [labelDraft, setLabelDraft] = useState(note.label)

  function save() {
    const year = Number(yearDraft)
    const label = labelDraft.trim()
    if (!Number.isFinite(year) || year < 1900 || year > 2200 || !label) return
    onUpdate(note.id, { year: Math.floor(year), label })
    setEditing(false)
  }

  function cancel() {
    setYearDraft(String(note.year))
    setLabelDraft(note.label)
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
          <span className="w-10 shrink-0 tabular-nums text-white/40">{note.year}</span>
          <span className="min-w-0 flex-1 truncate">{note.label}</span>
        </button>
        <button
          type="button"
          className="shrink-0 text-white/30 hover:text-red-300/80"
          onClick={() => onRemove(note.id)}
          aria-label={`Remove note ${note.label}`}
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
        aria-label="Note year"
      />
      <input
        className="input !w-44 !py-0.5 !text-[11px]"
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
        maxLength={80}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') cancel()
        }}
        aria-label="Note label"
        autoFocus
      />
      <button type="button" className="btn-ghost !py-0.5 !text-[11px]" onClick={save}>
        Save
      </button>
      <button type="button" className="btn-ghost !py-0.5 !text-[11px]" onClick={cancel}>
        Cancel
      </button>
    </div>
  )
}

/** Quiet year-note list for History / Overview charts. */
export function ChartNotes({
  annotations,
  error,
  defaultYear,
  onAdd,
  onUpdate,
  onRemove,
}: Props) {
  const [open, setOpen] = useState(false)
  const [yearDraft, setYearDraft] = useState(String(defaultYear))
  const [labelDraft, setLabelDraft] = useState('')

  function submit() {
    const year = Number(yearDraft)
    const label = labelDraft.trim()
    if (!Number.isFinite(year) || year < 1900 || year > 2200 || !label) return
    onAdd(Math.floor(year), label)
    setLabelDraft('')
  }

  return (
    <div className="text-[11px] text-white/50">
      <button
        type="button"
        className="text-white/45 hover:text-white/75"
        onClick={() => setOpen((v) => !v)}
      >
        Notes{annotations.length > 0 ? ` · ${annotations.length}` : ''}
      </button>
      {open ? (
        <div className="mt-1.5 space-y-1">
          {annotations.map((a) => (
            <NoteRow key={a.id} note={a} onUpdate={onUpdate} onRemove={onRemove} />
          ))}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <input
              className="input !w-[4.5rem] !py-0.5 !text-[11px] tabular-nums"
              type="number"
              value={yearDraft}
              onChange={(e) => setYearDraft(e.target.value)}
              aria-label="New note year"
            />
            <input
              className="input !w-44 !py-0.5 !text-[11px]"
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder="Job change, house…"
              maxLength={80}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit()
              }}
              aria-label="New note label"
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
