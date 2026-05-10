/**
 * VertexListEditor — inline lon/lat/alt rows for a node's vertex list.
 *
 * Renders one row per `params.positions[i]`. Editing a cell flushes the
 * whole positions array back through `updateNodePositions`, which marks
 * the node dirty so the Cesium reconciler redraws + the persistence
 * hook saves. A row's delete button drops that vertex; an "+ add
 * vertex" footer appends a clone of the last entry (or a default
 * [0,0,0] when the list is empty).
 *
 * Spec V1_SPEC.md §6.
 */
import { Trash2, Plus } from 'lucide-react'
import { useCadEngine } from '../sketch/useCadEngine'
import type { Position } from '../sketch/types'

interface Props {
  nodeId: string
  /** When true, the editor is read-only — used by the modify-props
   *  panel for solid types whose positions are anchor-only. */
  readOnly?: boolean
  /** Cap on rows shown before the list scrolls — keeps long polylines
   *  from blowing out the panel. v1 default = 200. */
  maxVisible?: number
}

export default function VertexListEditor({ nodeId, readOnly, maxVisible = 200 }: Props) {
  const node = useCadEngine(s => s.nodes[nodeId])
  const updateNodePositions = useCadEngine(s => s.updateNodePositions)

  if (!node) return null

  const positions: Position[] = (node.params.positions ?? []) as Position[]

  function patchVertex(i: number, idx: 0 | 1 | 2, value: number) {
    const next = positions.map(p => [...p] as Position)
    const cur = next[i] ?? [0, 0, 0]
    while (cur.length < 3) cur.push(0)
    cur[idx] = value
    next[i] = cur as Position
    updateNodePositions(nodeId, next)
  }

  function removeVertex(i: number) {
    const next = positions.filter((_, j) => j !== i)
    updateNodePositions(nodeId, next)
  }

  function addVertex() {
    const last = positions[positions.length - 1]
    const fresh: Position = last
      ? [last[0], last[1], (last[2] ?? 0)]
      : [0, 0, 0]
    updateNodePositions(nodeId, [...positions, fresh])
  }

  if (positions.length === 0) {
    return (
      <div className="dw-vertex-empty">
        <p>Click on the map to add vertices.</p>
        {!readOnly && (
          <button type="button" className="dw-vertex-add" onClick={addVertex}>
            <Plus size={11} /> Add vertex manually
          </button>
        )}
      </div>
    )
  }

  const visible = positions.slice(0, maxVisible)
  const truncated = positions.length - visible.length

  return (
    <div className="dw-vertex-list">
      <div className="dw-vertex-head">
        <span>#</span>
        <span>Lon</span>
        <span>Lat</span>
        <span>Alt</span>
        <span aria-hidden />
      </div>
      {visible.map((p, i) => (
        <div className="dw-vertex-row" key={i}>
          <span className="dw-vertex-idx">{i + 1}</span>
          <input
            type="number"
            className="dw-vertex-input"
            value={p[0] ?? 0}
            step={0.000001}
            disabled={readOnly}
            onChange={e => patchVertex(i, 0, Number(e.target.value))}
            aria-label={`Vertex ${i + 1} longitude`}
          />
          <input
            type="number"
            className="dw-vertex-input"
            value={p[1] ?? 0}
            step={0.000001}
            disabled={readOnly}
            onChange={e => patchVertex(i, 1, Number(e.target.value))}
            aria-label={`Vertex ${i + 1} latitude`}
          />
          <input
            type="number"
            className="dw-vertex-input"
            value={p[2] ?? 0}
            step={0.1}
            disabled={readOnly}
            onChange={e => patchVertex(i, 2, Number(e.target.value))}
            aria-label={`Vertex ${i + 1} altitude`}
          />
          {!readOnly && (
            <button
              type="button"
              className="dw-vertex-del"
              title={`Remove vertex ${i + 1}`}
              onClick={() => removeVertex(i)}
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ))}
      {truncated > 0 && (
        <div className="dw-vertex-truncated">
          + {truncated} more — edit via the Features tab.
        </div>
      )}
      {!readOnly && (
        <button type="button" className="dw-vertex-add" onClick={addVertex}>
          <Plus size={11} /> Add vertex
        </button>
      )}
    </div>
  )
}
