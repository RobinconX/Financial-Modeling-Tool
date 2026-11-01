import { useState } from 'react'
import {
  listGuideSidebarTree,
  type FeatureGuide,
  type GuideTreeNode,
} from '../../lib/teachings'
import { useFeatureGuide } from './FeatureGuideProvider'

function useCollapseState(defaultOpen = true) {
  const [open, setOpen] = useState<Record<string, boolean>>({})

  function isOpen(id: string) {
    return open[id] ?? defaultOpen
  }

  function toggle(id: string) {
    setOpen((prev) => ({ ...prev, [id]: !(prev[id] ?? defaultOpen) }))
  }

  return { isOpen, toggle }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-white/40 transition-transform ${
        open ? 'rotate-90' : ''
      }`}
      aria-hidden
    >
      ▸
    </span>
  )
}

function GuideRow({
  guide,
  depth,
  onSelect,
  activeId,
  hasChildren,
  expanded,
  onToggleExpand,
}: {
  guide: FeatureGuide
  depth: number
  onSelect: (id: string) => void
  activeId: string | null
  hasChildren: boolean
  expanded: boolean
  onToggleExpand: () => void
}) {
  const active = activeId === guide.id
  return (
    <div
      className={`flex w-full items-center gap-0.5 rounded-lg transition hover:bg-white/5 ${
        active ? 'bg-white/[0.07]' : ''
      }`}
      style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
    >
      {hasChildren ? (
        <button
          type="button"
          onClick={onToggleExpand}
          className="shrink-0 rounded p-1 hover:bg-white/5"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${guide.title}` : `Expand ${guide.title}`}
        >
          <Chevron open={expanded} />
        </button>
      ) : (
        <span className="inline-flex h-4 w-4 shrink-0" aria-hidden />
      )}
      <button
        type="button"
        onClick={() => onSelect(guide.id)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-2 text-left"
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
    </div>
  )
}

function TreeNodes({
  nodes,
  depth,
  onSelect,
  activeId,
  isOpen,
  toggle,
}: {
  nodes: GuideTreeNode[]
  depth: number
  onSelect: (id: string) => void
  activeId: string | null
  isOpen: (id: string) => boolean
  toggle: (id: string) => void
}) {
  return (
    <>
      {nodes.map((n) => {
        const hasChildren = n.children.length > 0
        const expanded = hasChildren ? isOpen(n.guide.id) : false
        return (
          <div key={n.guide.id}>
            <GuideRow
              guide={n.guide}
              depth={depth}
              onSelect={onSelect}
              activeId={activeId}
              hasChildren={hasChildren}
              expanded={expanded}
              onToggleExpand={() => toggle(n.guide.id)}
            />
            {hasChildren && expanded ? (
              <TreeNodes
                nodes={n.children}
                depth={depth + 1}
                onSelect={onSelect}
                activeId={activeId}
                isOpen={isOpen}
                toggle={toggle}
              />
            ) : null}
          </div>
        )
      })}
    </>
  )
}

export function FeatureGuideIndex() {
  const { openGuide, activeId } = useFeatureGuide()
  const sections = listGuideSidebarTree()
  const { isOpen, toggle } = useCollapseState(true)

  return (
    <div className="space-y-5">
      {sections.map((section) => {
        const sectionOpen = isOpen(`section:${section.id}`)
        return (
          <section key={section.id}>
            <button
              type="button"
              onClick={() => toggle(`section:${section.id}`)}
              className="mb-2 flex w-full items-center gap-1 rounded-md px-2 py-1 text-left hover:bg-white/[0.04]"
              aria-expanded={sectionOpen}
            >
              <Chevron open={sectionOpen} />
              <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                {section.label}
              </h3>
            </button>
            {sectionOpen ? (
              <div className="space-y-3">
                {section.tabs.map((tab) => (
                  <div key={tab.tab}>
                    <TreeNodes
                      nodes={tab.roots}
                      depth={0}
                      onSelect={openGuide}
                      activeId={activeId}
                      isOpen={isOpen}
                      toggle={toggle}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}
