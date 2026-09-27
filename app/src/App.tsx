import { useState, useRef, useCallback } from 'react'
import { useGraphData } from './hooks/useGraphData'
import { GraphView } from './graph/GraphView'
import { NodePanel } from './panels/NodePanel'
import { ThreadControls } from './components/ThreadControls'
import { ZoomSlider } from './components/ZoomSlider'

export default function App() {
  const { data, positions, loading, error } = useGraphData()
  const [selectedNodeId, setSelectedNodeId]     = useState<string | null>(null)
  const [highlightedThreadId, setHighlightedThreadId] = useState<string | null>(null)
  const [showPlanPath, setShowPlanPath]         = useState(false)
  const [zoom, setZoom]                         = useState(1)
  const zoomToRef = useRef<((scale: number) => void) | null>(null)

  const handleZoomReady = useCallback((fn: (scale: number) => void) => {
    zoomToRef.current = fn
  }, [])

  if (loading) {
    return <div className="state-message">Loading curriculum…</div>
  }

  if (error || !data || !positions) {
    return (
      <div className="state-message state-error">
        <p>Could not load graph data.</p>
        <pre>{error}</pre>
        <p>Run <code>npm run generate</code> then <code>npm run layout</code> first.</p>
      </div>
    )
  }

  const selectedNode = selectedNodeId
    ? (data.nodes.find(n => n.id === selectedNodeId) ?? null)
    : null

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">AP Cybersecurity</h1>
        <div className="app-controls">
          <ThreadControls
            threads={data.threads}
            selectedThreadId={highlightedThreadId}
            onChange={setHighlightedThreadId}
          />
          <label className="plan-toggle">
            <input
              type="checkbox"
              checked={showPlanPath}
              onChange={e => setShowPlanPath(e.target.checked)}
            />
            Plan path
          </label>
          <ZoomSlider
            zoom={zoom}
            onZoomTo={scale => zoomToRef.current?.(scale)}
          />
        </div>
      </header>

      <div className="app-body">
        <GraphView
          data={data}
          positions={positions}
          selectedNodeId={selectedNodeId}
          highlightedThreadId={highlightedThreadId}
          showPlanPath={showPlanPath}
          onNodeClick={id => setSelectedNodeId(prev => (prev === id ? null : id))}
          onZoomChange={setZoom}
          onZoomReady={handleZoomReady}
        />
        {selectedNode && (
          <NodePanel
            node={selectedNode}
            data={data}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      <div className="app-legend">
        <span className="legend-item legend-domain">Domain (pan out to see)</span>
        <span className="legend-item legend-skill">Skill</span>
        <span className="legend-item legend-technique">Technique (zoom in)</span>
        <span className="legend-item legend-experience">Experience</span>
      </div>
    </div>
  )
}
