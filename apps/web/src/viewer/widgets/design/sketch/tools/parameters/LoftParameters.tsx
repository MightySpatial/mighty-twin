/** Loft op — picks 2+ source curves. Parameters panel shows the
 *  current source list; the actual picking happens via the place-mode
 *  bar's "pick second" flow. */
import { useCadEngine } from '../../useCadEngine'

export default function LoftParameters({ draftNodeId }: { draftNodeId: string }) {
  const node = useCadEngine(s => s.nodes[draftNodeId])
  if (!node) return null
  const sources = node.inputs ?? []
  return (
    <div className="dw-row">
      <div className="dw-section-label">Sources ({sources.length})</div>
      {sources.length === 0
        ? <p className="design-style-empty">Click two or more curves on the map.</p>
        : <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12, color: 'var(--dw-text-2)' }}>
            {sources.map((id, i) => (
              <li key={id} style={{ padding: '2px 0' }}>{i + 1}. {id}</li>
            ))}
          </ul>}
    </div>
  )
}
