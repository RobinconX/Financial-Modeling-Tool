import { useEffect, type ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  onConfirm,
  onClose,
}: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md space-y-4 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-dialog-title" className="text-lg font-semibold text-white">
          {title}
        </h3>
        <div className="space-y-2 text-sm text-white/65">{children}</div>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            autoFocus
            className={
              danger
                ? 'inline-flex cursor-pointer items-center justify-center rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-400'
                : 'btn-primary !py-1.5 !text-xs'
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
