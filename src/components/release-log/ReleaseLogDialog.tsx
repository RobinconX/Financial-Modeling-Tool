import { useEffect, useId } from 'react'
import { getAppBuildInfo } from '../../lib/appBuildInfo'
import { listReleaseLogEntries, shortSha } from '../../lib/releaseLog'
import { FeatureGuideButton } from '../guides/FeatureGuideButton'

type Props = {
  onClose: () => void
}

export function ReleaseLogDialog({ onClose }: Props) {
  const titleId = useId()
  const entries = listReleaseLogEntries()
  const build = getAppBuildInfo()

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
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="card flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col shadow-2xl"
        data-guide-anchor="release-log"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            <h3 id={titleId} className="text-lg font-semibold text-white">
              Release log
            </h3>
            <p className="mt-0.5 text-xs text-white/45">
              This build · v{build.packageVersion} ({build.gitShaShort})
            </p>
          </div>
          <FeatureGuideButton id="system.releaseLog" />
        </div>

        <ul className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          {entries.map((entry) => (
            <li
              key={`${entry.releasedAt}-${entry.headline}`}
              className="rounded-lg border border-white/8 bg-black/20 px-4 py-3"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-medium text-white">{entry.headline}</h4>
                <span className="text-[10px] uppercase tracking-wide text-white/35">
                  {entry.releasedAt}
                  {entry.pending ? ' · upcoming' : ''}
                </span>
              </div>
              {!entry.pending && entry.prodSha ? (
                <p className="mt-0.5 font-mono text-[10px] text-white/30">prod {shortSha(entry.prodSha)}</p>
              ) : null}
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs leading-relaxed text-white/60">
                {entry.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 justify-end border-t border-white/8 px-5 py-3">
          <button type="button" className="btn-ghost !py-1.5 !text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
