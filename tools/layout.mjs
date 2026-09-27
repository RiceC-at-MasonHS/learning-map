#!/usr/bin/env node
/**
 * Compute stable node positions using cytoscape-cola (force-directed).
 * Run once; commit the result. Re-run deliberately when the graph shape changes.
 *
 *   cd app && npm run layout
 *
 * MANUAL FINE-TUNING
 * ------------------
 * Edit app/public/graph-positions.json directly. Each entry is:
 *   "node-id": { "x": 400, "y": 200 }
 * x/y are node CENTER coordinates. Larger x = further right, larger y = further down.
 * Changes are permanent until you re-run this script.
 *
 * LAYOUT ZONES
 * ---------------------------------------
 *   Skills + Experiences: cola force-directed
 *     - requires edges drive left-right DAG ordering (flow axis)
 *     - practices edges spring-pull experiences near their practiced skills
 *   Domains:    centroid of their child-skill cluster
 *   Techniques: stacked below parent skill (visible only on deep zoom)
 */
import { createRequire }              from 'module'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname }           from 'path'
import { fileURLToPath }              from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT      = resolve(__dirname, '..')
const DATA      = resolve(ROOT, 'app/public/graph-data.json')
const OUT       = resolve(ROOT, 'app/public/graph-positions.json')

const req       = createRequire(resolve(ROOT, 'app/package.json'))
const cytoscape = req('cytoscape')
const cycola    = req('cytoscape-cola')
cytoscape.use(cycola)

const data = JSON.parse(readFileSync(DATA, 'utf8'))

// ── Step 1: cola force layout — SKILLS + EXPERIENCES ─────────────────────────

const SKILL_W = 180, SKILL_H = 56
const EXP_W   = 162, EXP_H   = 44

const layoutNodes = data.nodes.filter(n => n.kind === 'skill' || n.kind === 'experience')
const layoutIds   = new Set(layoutNodes.map(n => n.id))

// requires edges: source=dependent, target=prereq in graph-data.json
// flip so prereq=source, dependent=target → cola flow pushes dependent RIGHT of prereq
const requiresEdges = data.edges
  .filter(e => e.type === 'requires' && layoutIds.has(e.source) && layoutIds.has(e.target))
  .map((e, i) => ({
    data: { id: `req${i}`, source: e.target, target: e.source, etype: 'requires' },
  }))

// practices: experience→skill spring (experience clusters near its practiced skills)
const practicesEdges = data.edges
  .filter(e => e.type === 'practices' && layoutIds.has(e.source) && layoutIds.has(e.target))
  .map((e, i) => ({
    data: { id: `prac${i}`, source: e.source, target: e.target, etype: 'practices' },
  }))

const cy = cytoscape({
  headless: true,
  elements: {
    nodes: layoutNodes.map(n => ({
      data: {
        id:     n.id,
        width:  n.kind === 'skill' ? SKILL_W : EXP_W,
        height: n.kind === 'skill' ? SKILL_H : EXP_H,
      },
    })),
    edges: [...requiresEdges, ...practicesEdges],
  },
})

// cola is synchronous when animate:false — no async needed
cy.layout({
  name: 'cola',
  animate: false,
  flow: { axis: 'x', minSeparation: 80 },  // gentle left=prereq, right=advanced
  nodeSpacing: 70,
  edgeLength: edge => {
    const etype = edge.data('etype')
    if (etype === 'requires')  return 220   // spread skill nodes out
    if (etype === 'practices') return 130   // experiences orbit near their skills
    return 170
  },
  maxSimulationTime: 8000,
  convergenceThreshold: 0.000001,
  randomize: true,
  handleDisconnected: true,
}).run()

const positions = {}
cy.nodes().forEach(n => {
  positions[n.id()] = { x: Math.round(n.position('x')), y: Math.round(n.position('y')) }
})

// ── Step 2: Domain positions ─────────────────────────────────────────────────
// Centroid of child skills, placed above the cluster.

for (const node of data.nodes.filter(n => n.kind === 'domain')) {
  const children = data.nodes.filter(s => s.kind === 'skill' && s.parent === node.id && positions[s.id])
  if (children.length > 0) {
    const xs = children.map(s => positions[s.id].x)
    const ys = children.map(s => positions[s.id].y)
    positions[node.id] = {
      x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
      y: Math.round(Math.min(...ys) - 110),
    }
  } else {
    positions[node.id] = { x: 150, y: 80 }
  }
}

// ── Step 3: Technique positions ──────────────────────────────────────────────
// Stack below parent skill; visible only at deep zoom.

const TECH_STEP  = 44
const TECH_START = 50   // gap from skill center to first technique center

const techniquesByParent = {}
for (const node of data.nodes.filter(n => n.kind === 'technique')) {
  const p = node.parent ?? '_none'
  ;(techniquesByParent[p] ??= []).push(node)
}

for (const [parentId, techniques] of Object.entries(techniquesByParent)) {
  const pp = positions[parentId]
  if (!pp) { techniques.forEach(t => { positions[t.id] = { x: 150, y: 150 } }); continue }
  for (let i = 0; i < techniques.length; i++) {
    positions[techniques[i].id] = {
      x: Math.round(pp.x),
      y: Math.round(pp.y + TECH_START + i * TECH_STEP),
    }
  }
}

// ── Write ────────────────────────────────────────────────────────────────────
writeFileSync(OUT, JSON.stringify(positions, null, 2))

const kinds   = ['domain', 'skill', 'technique', 'experience']
const summary = kinds.map(k =>
  `${data.nodes.filter(n => n.kind === k && positions[n.id]).length} ${k}`,
).join(', ')
console.log(`Wrote ${OUT}`)
console.log(`  ${Object.keys(positions).length} nodes: ${summary}`)
