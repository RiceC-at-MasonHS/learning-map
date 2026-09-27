export type NodeKind = 'domain' | 'skill' | 'technique' | 'experience'
export type EdgeType = 'requires' | 'builds_on' | 'relates' | 'practices'
export type StandardLevel = 'unit' | 'topic' | 'learning_objective' | 'essential_knowledge'

export interface CurriculumNode {
  id: string
  kind: NodeKind
  title: string
  parent?: string
  summary?: string
  aligns?: string[]
  format?: string
  purpose?: string
  duration_min?: number
  evidence?: string
  commands?: string[]
  notes?: string
}

export interface GraphEdge {
  source: string
  target: string
  type: EdgeType
}

export interface Thread {
  id: string
  title: string
  objectives: string[]
  node_ids: string[]
  foundation?: string
}

export interface Standard {
  id: string
  ref: string
  level: StandardLevel
  title: string
  text: string
  parent: string | null
  demand?: string
  status: string
}

export interface PlanStep {
  id: string
  title: string
  sync: boolean
  experiences?: string[]
  choices?: string[]
  reveals?: string[]
  notes?: string
}

export interface GraphData {
  nodes: CurriculumNode[]
  edges: GraphEdge[]
  threads: Thread[]
  standards: Record<string, Standard>
  plan_steps: PlanStep[]
}

export interface NodePosition {
  x: number
  y: number
}

export type Positions = Record<string, NodePosition>
