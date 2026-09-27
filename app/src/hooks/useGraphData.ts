import { useEffect, useState } from 'react'
import type { GraphData, Positions } from '../types/curriculum'

interface GraphDataState {
  data: GraphData | null
  positions: Positions | null
  loading: boolean
  error: string | null
}

export function useGraphData(): GraphDataState {
  const [state, setState] = useState<GraphDataState>({
    data: null,
    positions: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(`${base}graph-data.json`).then(r => {
        if (!r.ok) throw new Error(`graph-data.json: ${r.status} — run npm run generate`)
        return r.json() as Promise<GraphData>
      }),
      fetch(`${base}graph-positions.json`).then(r => {
        if (!r.ok) throw new Error(`graph-positions.json: ${r.status} — run npm run layout`)
        return r.json() as Promise<Positions>
      }),
    ])
      .then(([data, positions]) => setState({ data, positions, loading: false, error: null }))
      .catch(err => setState({ data: null, positions: null, loading: false, error: String(err) }))
  }, [])

  return state
}
