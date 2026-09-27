import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import type { GraphData, Positions, CurriculumNode, GraphEdge } from '../types/curriculum'
import './GraphView.css'

// ── SIZE HIERARCHY ────────────────────────────────────────────────────────────
const NODE_W: Record<string, number> = { skill: 180, technique: 138, experience: 162 }
const NODE_H: Record<string, number> = { skill:  56, technique:  38, experience:  44 }
const NODE_RX: Record<string, number> = { skill:   9, technique:   6, experience:  22 }

const NODE_FILL: Record<string, string> = {
  skill:      '#166534',
  technique:  '#78350f',
  experience: '#581c87',
}

const NODE_FONT_SIZE:   Record<string, number> = { skill: 13, technique: 11, experience: 11 }
const NODE_FONT_WEIGHT: Record<string, number> = { skill: 600, technique: 400, experience: 400 }
const WRAP_AT:          Record<string, number> = { skill: 17, technique: 22, experience: 17 }

// ── DOMAIN REGION COLORS ──────────────────────────────────────────────────────
const DOMAIN_BG: Record<string, string> = {
  'linux-foundations':  '#042f2e',
  'version-control':    '#1e1b4b',
  'lab-infrastructure': '#082040',
  'crypto-in-practice': '#2e1065',
  'detection-practice': '#052e16',
  'appsec-practice':    '#431407',
  'security-reasoning': '#450a0a',
}
const DOMAIN_STROKE: Record<string, string> = {
  'linux-foundations':  '#14b8a6',
  'version-control':    '#6366f1',
  'lab-infrastructure': '#3b82f6',
  'crypto-in-practice': '#a855f7',
  'detection-practice': '#22c55e',
  'appsec-practice':    '#f97316',
  'security-reasoning': '#ef4444',
}
const DOMAIN_LABEL_COLOR: Record<string, string> = {
  'linux-foundations':  '#5eead4',
  'version-control':    '#a5b4fc',
  'lab-infrastructure': '#93c5fd',
  'crypto-in-practice': '#d8b4fe',
  'detection-practice': '#86efac',
  'appsec-practice':    '#fed7aa',
  'security-reasoning': '#fca5a5',
}

// ── ZOOM THRESHOLDS ───────────────────────────────────────────────────────────
// Overview (< SHOW_SKILLS): only domain regions visible — they ARE the nodes
// Map (>= SHOW_SKILLS, < SHOW_TECHNIQUE): skills + experiences visible
// Detail (>= SHOW_TECHNIQUE): techniques also visible
const ZOOM_SHOW_SKILLS    = 0.28   // below this, only region backgrounds rendered
const ZOOM_SHOW_TECHNIQUE = 0.85   // below this, techniques hidden

// ── EDGE WEIGHTS ──────────────────────────────────────────────────────────────
const EDGE_STROKE: Record<string, number> = { requires: 2.5, builds_on: 1.5, practices: 1.5 }
const EDGE_DASH:   Record<string, string> = { builds_on: '6 4', practices: '3 3' }
const EDGE_COLOR:  Record<string, string> = {
  requires: '#6b7280',
  builds_on: '#4b5563',
  practices: '#4c1d95',
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function nw(kind: string) { return NODE_W[kind] ?? 160 }
function nh(kind: string) { return NODE_H[kind] ?? 44 }

function wrapTitle(title: string, kind: string): [string, string | null] {
  const max = WRAP_AT[kind] ?? 17
  if (title.length <= max) return [title, null]
  const mid = Math.floor(title.length / 2)
  let split = -1
  for (let d = 0; d <= 10; d++) {
    if (mid - d > 0 && title[mid - d] === ' ') { split = mid - d; break }
    if (mid + d < title.length && title[mid + d] === ' ') { split = mid + d; break }
  }
  if (split < 2) return [title.slice(0, max - 1) + '…', null]
  const l2 = title.slice(split + 1)
  return [title.slice(0, split), l2.length > max ? l2.slice(0, max - 1) + '…' : l2]
}

function regionOpacity(zoom: number): number {
  // 0–0.20: pure overview, regions fully opaque (domains ARE the map nodes)
  if (zoom <= 0.20) return 0.80
  // 0.20–0.28: quick fade so regions become subtle just as skills appear
  if (zoom <= ZOOM_SHOW_SKILLS) {
    const t = (zoom - 0.20) / (ZOOM_SHOW_SKILLS - 0.20)
    return 0.80 - t * 0.65   // 0.80 → 0.15
  }
  // 0.28–0.80: gentle background glow while skills are in focus
  if (zoom >= 0.80) return 0.04
  const t = (zoom - ZOOM_SHOW_SKILLS) / (0.80 - ZOOM_SHOW_SKILLS)
  return 0.15 - t * 0.11
}

function domainBBox(domainId: string, skillNodes: CurriculumNode[], positions: Positions) {
  const children = skillNodes.filter(n => n.parent === domainId && positions[n.id])
  if (children.length === 0) return null
  const pad = 72
  const xs = children.map(n => positions[n.id].x)
  const ys = children.map(n => positions[n.id].y)
  return {
    x: Math.min(...xs) - nw('skill') / 2 - pad,
    y: Math.min(...ys) - nh('skill') / 2 - pad,
    w: Math.max(...xs) - Math.min(...xs) + nw('skill') + pad * 2,
    h: Math.max(...ys) - Math.min(...ys) + nh('skill') + pad * 2,
  }
}

// Find where a ray from (cx,cy) toward (tx,ty) exits the node's bounding rectangle.
function nodeEdgePoint(cx: number, cy: number, kind: string, tx: number, ty: number) {
  const hw = nw(kind) / 2, hh = nh(kind) / 2
  const dx = tx - cx, dy = ty - cy
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return { x: cx, y: cy }
  const ux = dx / len, uy = dy / len
  const tx_ = Math.abs(ux) < 0.001 ? Infinity : hw / Math.abs(ux)
  const ty_ = Math.abs(uy) < 0.001 ? Infinity : hh / Math.abs(uy)
  const t   = Math.min(tx_, ty_)
  return { x: cx + ux * t, y: cy + uy * t }
}

// Curved path between two nodes — works for any direction (cola force layout).
function edgePath(
  fromPos: { x: number; y: number }, fromKind: string,
  toPos:   { x: number; y: number }, toKind:   string,
): string {
  const p1 = nodeEdgePoint(fromPos.x, fromPos.y, fromKind, toPos.x, toPos.y)
  const p2 = nodeEdgePoint(toPos.x,   toPos.y,   toKind,   fromPos.x, fromPos.y)
  const dx = p2.x - p1.x, dy = p2.y - p1.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 2) return `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`
  // Slight perpendicular bow so parallel edges don't overlap
  const curve = Math.min(28, len * 0.10)
  const nx = (-dy / len) * curve, ny = (dx / len) * curve
  const mx = (p1.x + p2.x) / 2 + nx, my = (p1.y + p2.y) / 2 + ny
  return `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`
}

// ── DOMAIN REGION ─────────────────────────────────────────────────────────────

interface DomainRegionProps {
  domain: CurriculumNode
  skillNodes: CurriculumNode[]
  positions: Positions
  zoom: number
  selected: boolean
  onClick: () => void
}

function DomainRegion({ domain, skillNodes, positions, zoom, selected, onClick }: DomainRegionProps) {
  const bbox = domainBBox(domain.id, skillNodes, positions)
  if (!bbox) return null

  const bg     = DOMAIN_BG[domain.id]     ?? '#1e293b'
  const stroke = DOMAIN_STROKE[domain.id] ?? '#475569'
  const label  = DOMAIN_LABEL_COLOR[domain.id] ?? '#94a3b8'

  const fillOp   = regionOpacity(zoom)
  const strokeOp = Math.min(0.95, fillOp * 1.8)
  // Constant screen-size label so domain name is readable at any zoom
  const labelSize = Math.round(22 / zoom)
  const labelOp   = Math.min(1, fillOp * 1.4)

  return (
    <g className="domain-region" onClick={onClick} style={{ cursor: 'pointer' }}>
      <rect
        x={bbox.x} y={bbox.y}
        width={bbox.w} height={bbox.h}
        rx={20}
        fill={bg}
        fillOpacity={fillOp}
        stroke={selected ? '#f8fafc' : stroke}
        strokeWidth={selected ? 3 / zoom : 1.5 / zoom}
        strokeOpacity={strokeOp}
      />
      <text
        x={bbox.x + bbox.w / 2}
        y={bbox.y + labelSize * 1.4}
        textAnchor="middle"
        fill={label}
        fontSize={labelSize}
        fontWeight={700}
        opacity={labelOp}
        pointerEvents="none"
        style={{ userSelect: 'none' }}
      >
        {domain.title}
      </text>
    </g>
  )
}

// ── EDGE EL ───────────────────────────────────────────────────────────────────

interface EdgeElProps {
  edge: GraphEdge
  positions: Positions
  nodeMap: Map<string, CurriculumNode>
}

function EdgeEl({ edge, positions, nodeMap }: EdgeElProps) {
  const isReq  = edge.type === 'requires'
  // requires in graph-data: source=dependent, target=prereq — draw from prereq→dependent
  const fromId = isReq ? edge.target : edge.source
  const toId   = isReq ? edge.source : edge.target

  const fromNode = nodeMap.get(fromId)
  const toNode   = nodeMap.get(toId)
  const fromPos  = positions[fromId]
  const toPos    = positions[toId]
  if (!fromNode || !toNode || !fromPos || !toPos) return null

  const d = edgePath(fromPos, fromNode.kind, toPos, toNode.kind)

  return (
    <path
      d={d}
      fill="none"
      stroke={EDGE_COLOR[edge.type] ?? '#4b5563'}
      strokeWidth={EDGE_STROKE[edge.type] ?? 1.5}
      strokeDasharray={EDGE_DASH[edge.type]}
      markerEnd={isReq ? 'url(#arrow-requires)' : undefined}
      opacity={0.80}
    />
  )
}

// ── NODE EL ───────────────────────────────────────────────────────────────────

interface NodeElProps {
  node: CurriculumNode
  pos: { x: number; y: number }
  selected: boolean
  threadHighlight: boolean
  planPath: boolean
  onClick: () => void
}

function NodeEl({ node, pos, selected, threadHighlight, planPath, onClick }: NodeElProps) {
  const w  = nw(node.kind), h  = nh(node.kind)
  const fs = NODE_FONT_SIZE[node.kind]   ?? 12
  const fw = NODE_FONT_WEIGHT[node.kind] ?? 400

  let sColor = 'transparent', sWidth = 0
  if (selected)              { sColor = '#f8fafc'; sWidth = 3   }
  else if (threadHighlight)  { sColor = '#fbbf24'; sWidth = 2.5 }
  else if (planPath)         { sColor = '#a78bfa'; sWidth = 2   }

  const [line1, line2] = wrapTitle(node.title, node.kind)

  return (
    <g
      className={`node node-${node.kind}${selected ? ' node-selected' : ''}`}
      transform={`translate(${pos.x - w / 2}, ${pos.y - h / 2})`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
      role="button"
      aria-label={node.title}
    >
      <rect
        width={w} height={h}
        rx={NODE_RX[node.kind] ?? 6}
        fill={NODE_FILL[node.kind] ?? '#374151'}
        stroke={sColor}
        strokeWidth={sWidth}
      />
      <text
        x={w / 2} y={h / 2 + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#f1f5f9"
        fontSize={fs}
        fontWeight={fw}
        pointerEvents="none"
      >
        {line2 ? (
          <>
            <tspan x={w / 2} dy={`${-fs * 0.6}px`}>{line1}</tspan>
            <tspan x={w / 2} dy={`${fs * 1.25}px`}>{line2}</tspan>
          </>
        ) : line1}
      </text>
    </g>
  )
}

// ── GRAPH VIEW ────────────────────────────────────────────────────────────────

interface Props {
  data: GraphData
  positions: Positions
  selectedNodeId: string | null
  highlightedThreadId: string | null
  showPlanPath: boolean
  onNodeClick: (id: string) => void
  onZoomChange?: (zoom: number) => void
  onZoomReady?: (zoomTo: (scale: number) => void) => void
}

export function GraphView({
  data, positions, selectedNodeId, highlightedThreadId, showPlanPath,
  onNodeClick, onZoomChange, onZoomReady,
}: Props) {
  const svgRef  = useRef<SVGSVGElement>(null)
  const gRef    = useRef<SVGGElement>(null)
  const zbRef   = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [zoom, setZoom] = useState(1)

  useEffect(() => {
    const svgEl = svgRef.current
    const gEl   = gRef.current
    if (!svgEl || !gEl) return

    const svg = d3.select(svgEl)
    const zb  = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.07, 5])
      .on('zoom', ev => {
        gEl.setAttribute('transform', ev.transform.toString())
        setZoom(ev.transform.k)
        onZoomChange?.(ev.transform.k)
      })

    zbRef.current = zb
    svg.call(zb)

    // Initial fit: frame the skill cluster
    const primary = data.nodes.filter(
      n => n.kind === 'skill' && positions[n.id],
    )
    if (primary.length > 0) {
      const xs  = primary.map(n => positions[n.id].x)
      const ys  = primary.map(n => positions[n.id].y)
      const pad = 120
      const bx  = Math.min(...xs) - pad, by = Math.min(...ys) - pad
      const bw  = Math.max(...xs) - bx   + pad, bh = Math.max(...ys) - by + pad
      const svgW = svgEl.clientWidth  || 1100
      const svgH = svgEl.clientHeight || 700
      const sc   = Math.min(svgW / bw, svgH / bh, 1.0) * 0.88
      svg.call(zb.transform, d3.zoomIdentity
        .translate((svgW - bw * sc) / 2 - bx * sc, (svgH - bh * sc) / 2 - by * sc)
        .scale(sc))
    }

    // Expose programmatic zoom to parent (for zoom slider)
    if (onZoomReady) {
      onZoomReady((targetScale: number) => {
        const current = d3.zoomTransform(svgEl)
        const svgW = svgEl.clientWidth  || 1100
        const svgH = svgEl.clientHeight || 700
        // Scale around the viewport center, keeping the same point under center
        const cx = svgW / 2, cy = svgH / 2
        const graphCx = (cx - current.x) / current.k
        const graphCy = (cy - current.y) / current.k
        const newX = cx - graphCx * targetScale
        const newY = cy - graphCy * targetScale
        svg.transition().duration(250)
          .call(zb.transform, d3.zoomIdentity.translate(newX, newY).scale(targetScale))
      })
    }

    return () => { svg.on('.zoom', null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])   // stable — run once on mount

  const nodeMap    = new Map(data.nodes.map(n => [n.id, n]))
  const skillNodes = data.nodes.filter(n => n.kind === 'skill')
  const domains    = data.nodes.filter(n => n.kind === 'domain')

  const threadNodes = highlightedThreadId
    ? new Set(data.threads.find(t => t.id === highlightedThreadId)?.node_ids ?? [])
    : null

  const planNodes = new Set<string>()
  if (showPlanPath) {
    for (const step of data.plan_steps) {
      for (const id of [...(step.experiences ?? []), ...(step.choices ?? [])]) {
        planNodes.add(id)
        data.edges.forEach(e => { if (e.source === id && e.type === 'practices') planNodes.add(e.target) })
      }
    }
  }

  function visible(n: CurriculumNode) {
    if (!positions[n.id]) return false
    if (n.kind === 'domain')    return false                 // always regions
    if (n.kind === 'technique') return zoom >= ZOOM_SHOW_TECHNIQUE
    // skills and experiences appear together when zooming past overview level
    return zoom >= ZOOM_SHOW_SKILLS
  }

  const visibleIds = new Set(data.nodes.filter(visible).map(n => n.id))

  const edges = data.edges.filter(e =>
    (e.type === 'requires' || e.type === 'builds_on' || e.type === 'practices') &&
    visibleIds.has(e.source) &&
    visibleIds.has(e.target),
  )

  const handleNodeClick = useCallback(
    (id: string) => onNodeClick(id),
    [onNodeClick],
  )

  return (
    <svg ref={svgRef} className="graph-svg">
      <defs>
        <marker
          id="arrow-requires"
          viewBox="0 0 10 10" refX="8" refY="5"
          markerWidth="6" markerHeight="6"
          orient="auto"
        >
          <path d="M 0 1 L 9 5 L 0 9 Z" fill="#6b7280" />
        </marker>
      </defs>

      <g ref={gRef}>
        {/* Layer 1: domain background regions — fully opaque at overview zoom */}
        {domains.map(d => (
          <DomainRegion
            key={d.id}
            domain={d}
            skillNodes={skillNodes}
            positions={positions}
            zoom={zoom}
            selected={d.id === selectedNodeId}
            onClick={() => handleNodeClick(d.id)}
          />
        ))}

        {/* Layer 2: edges (only between visible nodes) */}
        {edges.map(e => (
          <EdgeEl
            key={`${e.source}→${e.target}:${e.type}`}
            edge={e}
            positions={positions}
            nodeMap={nodeMap}
          />
        ))}

        {/* Layer 3: skill / technique / experience nodes */}
        {data.nodes.filter(visible).map(n => (
          <NodeEl
            key={n.id}
            node={n}
            pos={positions[n.id]}
            selected={n.id === selectedNodeId}
            threadHighlight={threadNodes?.has(n.id) ?? false}
            planPath={planNodes.has(n.id)}
            onClick={() => handleNodeClick(n.id)}
          />
        ))}
      </g>
    </svg>
  )
}
