import { useEffect, useState } from 'react'

export type ProjectionPickItem = {
  key: string
  label: string
  hint?: string
  /** Prefill when `rename` is on (import). */
  name?: string
}

export type ProjectionPickResult = {
  key: string
  name: string
}

type Props = {
  title: string
  description?: string
  items: ProjectionPickItem[]
  initialChecked: string[]
  confirmLabel: string
  /** Show an editable name on each row (import). */
  rename?: boolean
  onConfirm: (picked: ProjectionPickResult[]) => void
  onClose: () => void
}

export function ProjectionPickDialog({
  title,
  description,
  items,
  initialChecked,
  confirmLabel,
  rename = false,
  onConfirm,
  onClose,
}: Props) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initialChecked))
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((it) => [it.key, it.name ?? ''])),
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggle(key: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function select(key: string) {
    setChecked((prev) => {
      if (prev.has(key)) return prev
      const next = new Set(prev)
      next.add(key)
      return next
    })
  }

  const selected = items.filter((it) => checked.has(it.key))
  const firstCheckedKey = selected[0]?.key
  const namesReady =
    !rename ||
    selected.every((it) => (names[it.key] ?? it.name ?? '').trim().length > 0)

  function handleConfirm() {
    if (selected.length === 0 || !namesReady) return
    onConfirm(
      selected.map((it) => ({
        key: it.key,
        name: (names[it.key] ?? it.name ?? '').trim() || it.name || 'Base',
      })),
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-lg space-y-4 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          {description ? (
            <p className="mt-1 text-xs text-white/45">{description}</p>
          ) : null}
        </div>

        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {items.map((it) => {
            const on = checked.has(it.key)
            return (
              <li key={it.key} className="rounded-lg px-2 py-1.5 hover:bg-white/5">
                {rename ? (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        className="shrink-0"
                        checked={on}
                        onChange={() => toggle(it.key)}
                        aria-label={it.label}
                      />
                      <span className="shrink-0 text-sm font-medium text-white">
                        {it.label}
                      </span>
                      <input
                        className="input min-w-0 flex-1 !py-1.5"
                        value={names[it.key] ?? ''}
                        autoFocus={on && it.key === firstCheckedKey}
                        placeholder="Projection name"
                        aria-label={`Name for ${it.label}`}
                        onFocus={() => select(it.key)}
                        onChange={(e) => {
                          select(it.key)
                          setNames((prev) => ({ ...prev, [it.key]: e.target.value }))
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleConfirm()
                        }}
                      />
                    </div>
                    {it.hint ? (
                      <p className="pl-[1.375rem] text-[11px] text-white/40">{it.hint}</p>
                    ) : null}
                  </>
                ) : (
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="shrink-0"
                      checked={on}
                      onChange={() => toggle(it.key)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{it.label}</span>
                      {it.hint ? (
                        <span className="block text-[11px] text-white/40">{it.hint}</span>
                      ) : null}
                    </span>
                  </label>
                )}
              </li>
            )
          })}
        </ul>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary !py-1.5 !text-xs"
            disabled={selected.length === 0 || !namesReady}
            onClick={handleConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
