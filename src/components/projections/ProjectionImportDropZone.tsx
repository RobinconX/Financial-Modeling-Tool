import { useCallback, useRef, useState, type DragEvent } from 'react'
import {
  dragTransferHasInvalidProjectionImport,
  isJsonProjectionImportFile,
} from '../../lib/projectionPack'

type Props = {
  onFile: (file: File) => void
}

const INLINE_INVALID = 'JSON only'

export function ProjectionImportDropZone({ onFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [dragVisual, setDragVisual] = useState<'idle' | 'valid' | 'invalid'>('idle')
  const [inlineHint, setInlineHint] = useState<string | null>(null)

  const clearHintTimer = useCallback(() => {
    if (hintTimerRef.current != null) {
      window.clearTimeout(hintTimerRef.current)
      hintTimerRef.current = null
    }
  }, [])

  const showInlineHint = useCallback(
    (message: string) => {
      clearHintTimer()
      setInlineHint(message)
      hintTimerRef.current = window.setTimeout(() => {
        hintTimerRef.current = null
        setInlineHint(null)
      }, 3_000)
    },
    [clearHintTimer],
  )

  const acceptFile = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (!isJsonProjectionImportFile(file)) {
        showInlineHint(INLINE_INVALID)
        return
      }
      clearHintTimer()
      setInlineHint(null)
      onFile(file)
    },
    [clearHintTimer, onFile, showInlineHint],
  )

  function resetDrag() {
    dragDepthRef.current = 0
    setDragVisual('idle')
  }

  function onDragEnter(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current += 1
    if (!e.dataTransfer.types.includes('Files')) {
      setDragVisual('invalid')
      return
    }
    setDragVisual(
      dragTransferHasInvalidProjectionImport(e.dataTransfer) ? 'invalid' : 'valid',
    )
  }

  function onDragOver(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = dragVisual === 'invalid' ? 'none' : 'copy'
    if (!e.dataTransfer.types.includes('Files')) {
      setDragVisual('invalid')
      return
    }
    setDragVisual(
      dragTransferHasInvalidProjectionImport(e.dataTransfer) ? 'invalid' : 'valid',
    )
  }

  function onDragLeave(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    dragDepthRef.current -= 1
    if (dragDepthRef.current <= 0) resetDrag()
  }

  function onDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    e.stopPropagation()
    resetDrag()
    const file = e.dataTransfer.files[0]
    acceptFile(file)
  }

  return (
    <>
      <button
        type="button"
        className={`btn-ghost !py-1.5 !text-xs transition ${
          dragVisual === 'valid'
            ? 'border-dashed border-emerald-400/60 bg-emerald-500/10'
            : dragVisual === 'invalid'
              ? 'border-dashed border-red-400/50 bg-red-500/10'
              : inlineHint
                ? 'border-red-400/40 text-red-200'
                : ''
        }`}
        aria-label="Import projection JSON file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {inlineHint ?? 'Import'}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json,text/json"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          acceptFile(f)
        }}
      />
    </>
  )
}