import type { Thread } from '../types/curriculum'

interface Props {
  threads: Thread[]
  selectedThreadId: string | null
  onChange: (id: string | null) => void
}

export function ThreadControls({ threads, selectedThreadId, onChange }: Props) {
  return (
    <label className="thread-select-label">
      Spiral thread:
      <select
        className="thread-select"
        value={selectedThreadId ?? ''}
        onChange={e => onChange(e.target.value || null)}
      >
        <option value="">— none —</option>
        {threads.map(t => (
          <option key={t.id} value={t.id}>{t.title}</option>
        ))}
      </select>
    </label>
  )
}
