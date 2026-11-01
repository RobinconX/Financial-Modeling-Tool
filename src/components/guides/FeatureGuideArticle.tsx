import {
  getGuide,
  getParentGuide,
  listChildGuides,
  type FeatureGuide,
  type FeatureGuideId,
} from '../../lib/teachings'
import { GuideMarkdown } from './GuideMarkdown'
import { useFeatureGuide } from './FeatureGuideProvider'

type Props = {
  id: FeatureGuideId
}

function RelatedLink({
  guide,
  onSelect,
}: {
  guide: FeatureGuide
  onSelect: (id: FeatureGuideId) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(guide.id)}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
    >
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-sky-300/90 hover:text-sky-200">
        {guide.title}
      </span>
      {guide.status === 'draft' ? (
        <span className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide bg-white/5 text-white/35">
          Draft
        </span>
      ) : null}
    </button>
  )
}

export function FeatureGuideArticle({ id }: Props) {
  const { showIndex, openGuide } = useFeatureGuide()
  const guide = getGuide(id)
  if (!guide) return null

  const isReady = guide.status === 'ready'
  const parent = getParentGuide(id)
  const children = listChildGuides(id)

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
        {parent ? (
          <button
            type="button"
            className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-sky-300 transition hover:text-sky-200"
            onClick={() => openGuide(parent.id)}
          >
            <span aria-hidden>↑</span>
            {parent.title}
          </button>
        ) : null}
        <h2 className="text-sm font-semibold tracking-wide text-white">{guide.title}</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-white/50">{guide.summary}</p>
        {!isReady ? (
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-white/35">
            Coming soon
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <GuideMarkdown source={guide.body} references={guide.references} />

        {children.length > 0 ? (
          <nav className="mt-8 border-t border-white/10 pt-4" aria-label="Child guides">
            <h3 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
              In this section
            </h3>
            <div className="space-y-0.5">
              {children.map((child) => (
                <RelatedLink key={child.id} guide={child} onSelect={openGuide} />
              ))}
            </div>
          </nav>
        ) : null}
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
