import {
  listGuideSidebarTree,
  type FeatureGuide,
  type GuideTreeNode,
} from '../../lib/teachings'
import { useFeatureGuide } from './FeatureGuideProvider'

function GuideRow({
  guide,
  depth,
  onSelect,
  activeId,
}: {
  guide: FeatureGuide
  depth: number
  onSelect: (id: string) => void
  activeId: string | null
}) {
  const active = activeId === guide.id
  return (
    <button
      type="button"
      onClick={() => onSelect(guide.id)}
      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5 ${
        active ? 'bg-white/[0.07]' : ''
      }`}
      style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
    >
      <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/90">
        {guide.title}
      </span>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
          guide.status === 'ready'
            ? 'bg-emerald-500/15 text-emerald-300/90'
            : 'bg-white/5 text-white/35'
        }`}
      >
        {guide.status === 'ready' ? 'Ready' : 'Draft'}
      </span>
    </button>
  )
}

function TreeNodes({
  nodes,
  depth,
  onSelect,
  activeId,
}: {
  nodes: GuideTreeNode[]
  depth: number
  onSelect: (id: string) => void
  activeId: string | null
}) {
  return (
    <>
      {nodes.map((n) => (
        <div key={n.guide.id}>
          <GuideRow guide={n.guide} depth={depth} onSelect={onSelect} activeId={activeId} />
          {n.children.length > 0 ? (
            <TreeNodes
              nodes={n.children}
              depth={depth + 1}
              onSelect={onSelect}
              activeId={activeId}
            />
          ) : null}
        </div>
      ))}
    </>
  )
}

export function FeatureGuideIndex() {
  const { openGuide, activeId } = useFeatureGuide()
  const sections = listGuideSidebarTree()

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.id}>
          <h3 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
            {section.label}
          </h3>
          <div className="space-y-3">
            {section.tabs.map((tab) => (
              <div key={tab.tab}>
                <TreeNodes
                  nodes={tab.roots}
                  depth={0}
                  onSelect={openGuide}
                  activeId={activeId}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
