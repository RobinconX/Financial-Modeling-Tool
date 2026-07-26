import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { Layer, Rectangle, ResponsiveContainer, Sankey } from 'recharts'
import { formatMoney } from '../../lib/format'
import {
  buildScenarioSankeyData,
  INCOME_COST_CURRENCY,
  type SankeyNode,
  type SankeyNodeKind,
} from '../../lib/incomeCost'
import type { CashflowLine } from '../../types'

type Props = {
  lines: CashflowLine[]
  scenarioId: string
  scenarioName: string
}

type TipContent = {
  name: string
  value: number
  note?: string
}

type TipState = TipContent & {
  x: number
  y: number
}

const KIND_FILL: Record<SankeyNodeKind, string> = {
  income: '#34d399',
  pool: '#38bdf8',
  cost: '#fbbf24',
  leftover: '#a78bfa',
  gap: '#f87171',
}

const KIND_LINK: Record<SankeyNodeKind, string> = {
  income: 'rgba(52, 211, 153, 0.35)',
  pool: 'rgba(56, 189, 248, 0.25)',
  cost: 'rgba(251, 191, 36, 0.35)',
  leftover: 'rgba(167, 139, 250, 0.4)',
  gap: 'rgba(248, 113, 113, 0.35)',
}

type HoverHandlers = {
  show: (content: TipContent, e: ReactMouseEvent) => void
  move: (e: ReactMouseEvent) => void
  hide: () => void
}

/** Pull the stable node key out of whatever shape Recharts gives us. */
function nodeKey(node: unknown): string | null {
  if (node == null) return null
  if (typeof node === 'number') return null
  if (typeof node === 'string') return node
  if (typeof node !== 'object') return null
  const n = node as Record<string, unknown>
  if (typeof n.name === 'string') return n.name
  if (n.payload && typeof n.payload === 'object') {
    const p = n.payload as Record<string, unknown>
    if (typeof p.name === 'string') return p.name
  }
  return null
}

function lookupNode(
  node: unknown,
  byKey: Map<string, SankeyNode>,
): SankeyNode | undefined {
  const key = nodeKey(node)
  if (key && byKey.has(key)) return byKey.get(key)
  if (node && typeof node === 'object') {
    const n = node as SankeyNode & { payload?: SankeyNode }
    if (n.displayName || n.kind) return n
    if (n.payload?.displayName || n.payload?.kind) return n.payload
  }
  return undefined
}

/**
 * Resolve tooltip content for a hovered band or node.
 * Never show internal keys like "in-uuid" / "out-uuid".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveFromLinkPayload(payload: any, byKey: Map<string, SankeyNode>): TipContent | null {
  if (!payload) return null
  const raw = payload.payload ?? payload
  const value = Number(raw.value ?? payload.value ?? 0)

  if (typeof raw.positionName === 'string' && raw.positionName.trim()) {
    return {
      name: raw.positionName,
      value: Number.isFinite(value) ? value : Number(raw.value) || 0,
      note: typeof raw.note === 'string' ? raw.note : undefined,
    }
  }

  if (raw.source != null && raw.target != null) {
    const source = lookupNode(raw.source, byKey)
    const target = lookupNode(raw.target, byKey)
    const leaf =
      target && target.kind !== 'pool'
        ? target
        : source && source.kind !== 'pool'
          ? source
          : target ?? source

    if (leaf) {
      return {
        name: leaf.displayName || leaf.name,
        value: Number.isFinite(value)
          ? value
          : (leaf.yearlyAmount ?? (Number(raw.value) || 0)),
        note: leaf.note ?? (typeof raw.note === 'string' ? raw.note : undefined),
      }
    }
  }

  return null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveFromNodePayload(payload: any, byKey: Map<string, SankeyNode>): TipContent | null {
  if (!payload) return null
  const node =
    lookupNode(payload, byKey) ??
    lookupNode(payload.payload, byKey)

  if (!node) return null
  return {
    name: node.displayName || node.name,
    value: node.yearlyAmount ?? (Number(payload.value) || 0),
    note: node.note,
  }
}

function SankeyTooltipBody({ name, value, note }: TipContent) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#121820] px-3 py-2 text-xs shadow-xl">
      <div className="font-semibold text-white">{name}</div>
      <div className="mt-0.5 tabular-nums text-emerald-400/90">
        {formatMoney(value, INCOME_COST_CURRENCY)}
        <span className="ml-1 font-normal text-white/40">/ year</span>
      </div>
      {note?.trim() ? (
        <p className="mt-1.5 max-w-[16rem] border-t border-white/10 pt-1.5 text-[11px] leading-snug text-white/55">
          {note.trim()}
        </p>
      ) : null}
    </div>
  )
}

function makeNodeShape(byKey: Map<string, SankeyNode>, hover: HoverHandlers) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function SankeyNodeShape(props: any) {
    const { x, y, width, height, payload, index } = props
    const kind: SankeyNodeKind = payload?.kind ?? 'pool'
    const label: string = payload?.displayName ?? payload?.name ?? ''
    const fill = KIND_FILL[kind] ?? KIND_FILL.pool
    const isLeft = kind === 'income' || kind === 'gap'
    const textX = isLeft ? x - 8 : x + width + 8
    const anchor = isLeft ? 'end' : 'start'

    const tip = resolveFromNodePayload(payload, byKey)

    const onEnter = (e: ReactMouseEvent) => {
      if (tip) hover.show(tip, e)
    }

    return (
      <Layer key={`node-${index}`}>
        <Rectangle
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          fillOpacity={0.9}
          radius={2}
          stroke="rgba(0,0,0,0.35)"
          strokeWidth={1}
          style={{ cursor: 'default' }}
          onMouseEnter={onEnter}
          onMouseMove={hover.move}
          onMouseLeave={hover.hide}
        />
        {/* Labels must not steal hover from bands underneath */}
        <text
          x={textX}
          y={y + height / 2}
          textAnchor={anchor}
          dominantBaseline="middle"
          fill="rgba(232,238,245,0.9)"
          fontSize={11}
          fontWeight={kind === 'pool' || kind === 'leftover' ? 600 : 400}
          style={{ pointerEvents: 'none' }}
        >
          {label}
        </text>
      </Layer>
    )
  }
}

function makeLinkShape(byKey: Map<string, SankeyNode>, hover: HoverHandlers) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function SankeyLinkShape(props: any) {
    const {
      sourceX,
      targetX,
      sourceY,
      targetY,
      sourceControlX,
      targetControlX,
      linkWidth,
      payload,
      index,
    } = props

    const targetKind: SankeyNodeKind =
      payload?.target?.kind ?? payload?.target?.payload?.kind ?? 'pool'
    const fill = KIND_LINK[targetKind] ?? 'rgba(148, 163, 184, 0.3)'

    // Closed ribbon path = full band is a real hit target (not a stroked centerline).
    const half = Math.max(Number(linkWidth) || 0, 2) / 2
    const sy0 = sourceY - half
    const sy1 = sourceY + half
    const ty0 = targetY - half
    const ty1 = targetY + half
    const d = [
      `M${sourceX},${sy0}`,
      `C${sourceControlX},${sy0} ${targetControlX},${ty0} ${targetX},${ty0}`,
      `L${targetX},${ty1}`,
      `C${targetControlX},${ty1} ${sourceControlX},${sy1} ${sourceX},${sy1}`,
      'Z',
    ].join(' ')

    const tip = resolveFromLinkPayload(payload, byKey)

    return (
      <path
        key={`link-${index}`}
        className="recharts-sankey-link"
        d={d}
        fill={fill}
        stroke={fill}
        strokeWidth={0.5}
        fillOpacity={0.85}
        style={{ pointerEvents: 'all', cursor: 'default' }}
        onMouseEnter={(e) => {
          if (tip) hover.show(tip, e)
        }}
        onMouseMove={hover.move}
        onMouseLeave={hover.hide}
      />
    )
  }
}

export function YearSankey({ lines, scenarioId, scenarioName }: Props) {
  const data = buildScenarioSankeyData(lines, scenarioId)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<TipState | null>(null)

  const byKey = useMemo(
    () => (data ? new Map(data.nodes.map((n) => [n.name, n])) : new Map<string, SankeyNode>()),
    [data],
  )

  const posFromEvent = useCallback((e: ReactMouseEvent) => {
    const el = containerRef.current
    if (!el) return { x: e.clientX, y: e.clientY }
    const rect = el.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }, [])

  const hover = useMemo<HoverHandlers>(
    () => ({
      show: (content, e) => {
        const { x, y } = posFromEvent(e)
        setTip({ ...content, x, y })
      },
      move: (e) => {
        const { x, y } = posFromEvent(e)
        setTip((prev) => (prev ? { ...prev, x, y } : prev))
      },
      hide: () => setTip(null),
    }),
    [posFromEvent],
  )

  const nodeShape = useMemo(() => makeNodeShape(byKey, hover), [byKey, hover])
  const linkShape = useMemo(() => makeLinkShape(byKey, hover), [byKey, hover])

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
        Add income and costs for “{scenarioName}” to see where money goes
      </div>
    )
  }

  const nodeCount = data.nodes.length
  const height = Math.max(320, Math.min(560, 120 + nodeCount * 36))

  // Keep tooltip inside the chart area
  const tipLeft = tip ? Math.min(tip.x + 14, Math.max(8, (containerRef.current?.clientWidth ?? 320) - 180)) : 0
  const tipTop = tip ? Math.max(8, tip.y - 12) : 0

  return (
    <div className="w-full">
      <div ref={containerRef} className="relative w-full" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <Sankey
            data={data}
            nameKey="displayName"
            nodeWidth={14}
            nodePadding={Math.max(18, Math.min(36, 280 / Math.max(nodeCount, 1)))}
            linkCurvature={0.45}
            iterations={64}
            margin={{ top: 12, right: 140, bottom: 12, left: 140 }}
            sort={false}
            node={nodeShape}
            link={linkShape}
          />
        </ResponsiveContainer>

        {tip ? (
          <div
            className="pointer-events-none absolute z-20"
            style={{ left: tipLeft, top: tipTop }}
          >
            <SankeyTooltipBody name={tip.name} value={tip.value} note={tip.note} />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] text-white/40">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-400" /> Income
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-sky-400" /> Total
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-amber-400" /> Costs
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-violet-400" /> Left over
        </span>
        <span className="text-white/30">★ one-time · {scenarioName}</span>
      </div>
    </div>
  )
}
