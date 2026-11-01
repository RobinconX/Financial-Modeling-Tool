import { getGuide, type FeatureGuideId } from '../../lib/teachings'
import { GuideMarkdown } from './GuideMarkdown'
import { useFeatureGuide } from './FeatureGuideProvider'

type Props = {
  id: FeatureGuideId
}

export function FeatureGuideArticle({ id }: Props) {
  const { showIndex } = useFeatureGuide()
  const guide = getGuide(id)
  if (!guide) return null

  const isReady = guide.status === 'ready'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-white/10 px-4 py-3">
        <button
          type="button"
          className="mb-2 text-[11px] font-medium text-sky-300/90 transition hover:text-sky-200"
          onClick={showIndex}
        >
          ← All guides
        </button>
        <h2 className="text-sm font-semibold tracking-wide text-white">{guide.title}</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-white/50">{guide.summary}</p>
        {!isReady ? (
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">
            Coming soon
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <GuideMarkdown source={guide.body} references={guide.references} />
      </div>

      {isReady && guide.bookUrl ? (
        <div className="shrink-0 border-t border-white/10 px-4 py-3">
          <a
            href={guide.bookUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-sky-300/90 transition hover:text-sky-200"
          >
            Deeper reading
          </a>
        </div>
      ) : null}
    </div>
  )
}
