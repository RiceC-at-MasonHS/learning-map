import type { CurriculumNode, GraphData } from '../types/curriculum'

interface Props {
  node: CurriculumNode
  data: GraphData
  onClose: () => void
}

const KIND_LABEL: Record<string, string> = {
  domain: 'Domain',
  skill: 'Skill',
  technique: 'Technique',
  experience: 'Experience',
}

const KIND_COLOR: Record<string, string> = {
  domain: '#1d4ed8',
  skill: '#15803d',
  technique: '#b45309',
  experience: '#7e22ce',
}

export function NodePanel({ node, data, onClose }: Props) {
  const parentNode = node.parent ? data.nodes.find(n => n.id === node.parent) : null

  // Standards this node aligns to (only LOs — level === learning_objective)
  const alignedStandards = (node.aligns ?? [])
    .map(ref => data.standards[ref])
    .filter(Boolean)
    .filter(s => s.level === 'learning_objective')

  // Threads that include this node
  const nodeThreads = data.threads.filter(t => t.node_ids.includes(node.id))

  // What this node requires
  const requires = data.edges
    .filter(e => e.source === node.id && e.type === 'requires')
    .map(e => data.nodes.find(n => n.id === e.target))
    .filter(Boolean) as CurriculumNode[]

  // What requires this node (dependents)
  const requiredBy = data.edges
    .filter(e => e.target === node.id && e.type === 'requires')
    .map(e => data.nodes.find(n => n.id === e.source))
    .filter(Boolean) as CurriculumNode[]

  // Plan steps that include this node (as experience or practice)
  const inSteps = data.plan_steps.filter(step => {
    const ids = [...(step.experiences ?? []), ...(step.choices ?? [])]
    if (ids.includes(node.id)) return true
    // Also match if a step's experience practices this skill
    for (const expId of ids) {
      const practices = data.edges.some(
        e => e.source === expId && e.target === node.id && e.type === 'practices',
      )
      if (practices) return true
    }
    return false
  })

  return (
    <aside className="node-panel">
      <button className="panel-close" onClick={onClose} aria-label="Close">✕</button>

      <div className="panel-kind" style={{ background: KIND_COLOR[node.kind] }}>
        {KIND_LABEL[node.kind] ?? node.kind}
      </div>
      <h2 className="panel-title">{node.title}</h2>

      {parentNode && (
        <p className="panel-parent">in {parentNode.title}</p>
      )}

      {node.summary && <p className="panel-summary">{node.summary}</p>}

      {node.kind === 'experience' && (
        <dl className="panel-dl">
          {node.format && <><dt>Format</dt><dd>{node.format}</dd></>}
          {node.purpose && <><dt>Purpose</dt><dd>{node.purpose}</dd></>}
          {node.duration_min && <><dt>Time</dt><dd>{node.duration_min} min</dd></>}
          {node.evidence && <><dt>Evidence</dt><dd>{node.evidence}</dd></>}
        </dl>
      )}

      {node.commands && node.commands.length > 0 && (
        <section className="panel-section">
          <h3>Commands</h3>
          <ul className="panel-commands">
            {node.commands.map(cmd => (
              <li key={cmd}><code>{cmd}</code></li>
            ))}
          </ul>
        </section>
      )}

      {requires.length > 0 && (
        <section className="panel-section">
          <h3>Requires</h3>
          <ul className="panel-list">
            {requires.map(n => <li key={n.id}>{n.title}</li>)}
          </ul>
        </section>
      )}

      {requiredBy.length > 0 && (
        <section className="panel-section">
          <h3>Unlocks</h3>
          <ul className="panel-list">
            {requiredBy.map(n => <li key={n.id}>{n.title}</li>)}
          </ul>
        </section>
      )}

      {nodeThreads.length > 0 && (
        <section className="panel-section">
          <h3>Spiral threads</h3>
          <ul className="panel-list panel-threads">
            {nodeThreads.map(t => <li key={t.id}>{t.title}</li>)}
          </ul>
        </section>
      )}

      {alignedStandards.length > 0 && (
        <section className="panel-section">
          <h3>AP Standards</h3>
          <ul className="panel-standards">
            {alignedStandards.map(s => (
              <li key={s.ref}>
                <span className="standard-ref">{s.ref}</span>
                <span className="standard-text">{s.text || s.title}</span>
                {s.demand && <span className="standard-demand">{s.demand}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {inSteps.length > 0 && (
        <section className="panel-section">
          <h3>Plan steps</h3>
          <ol className="panel-list">
            {inSteps.map(step => (
              <li key={step.id}>
                <strong>{step.id}</strong> — {step.title}
                {!step.sync && <span className="badge-choice"> (choice)</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  )
}
