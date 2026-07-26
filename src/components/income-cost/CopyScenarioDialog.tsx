import { useEffect, useState } from 'react'
import type { CashflowScenario } from '../../types'

type Props = {
  open: boolean
  scenarios: CashflowScenario[]
  defaultFromId: string
  onClose: () => void
  onCreate: (fromId: string, newName: string) => void
}

export function CopyScenarioDialog({
  open,
  scenarios,
  defaultFromId,
  onClose,
  onCreate,
}: Props) {
  const [fromId, setFromId] = useState(defaultFromId)
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    const from = scenarios.find((s) => s.id === defaultFromId) ?? scenarios[0]
    setFromId(from?.id ?? '')
    setName(from ? `Copy of ${from.name}` : 'New scenario')
  }, [open, defaultFromId, scenarios])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const from = scenarios.find((s) => s.id === fromId)

  function handleCreate() {
    const trimmed = name.trim()
    if (!fromId || !trimmed) return
    onCreate(fromId, trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Copy scenario"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md space-y-4 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold text-white">Copy scenario</h3>
          <p className="mt-1 text-xs text-white/45">
            Create a new named scenario with all positions from an existing one.
          </p>
        </div>

        <div>
          <label className="label">Copy from</label>
          <select
            className="input"
            value={fromId}
            onChange={(e) => {
              setFromId(e.target.value)
              const s = scenarios.find((x) => x.id === e.target.value)
              if (s) setName(`Copy of ${s.name}`)
            }}
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">New scenario name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 2027 plan"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
            }}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary !py-1.5 !text-xs"
            disabled={!from || !name.trim()}
            onClick={handleCreate}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
