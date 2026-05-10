/**
 * FeaturesTab — tree view of every node in the active sketch.
 *
 * Click a row → selectNode. Trash icon → removeNode (with cascade).
 * Filter by geometry kind (point / line / polygon / solid). v1's
 * full table view + drag-drop + CSV diff is queued for follow-up.
 */
import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import ToggleGroup from '../../primitives/ToggleGroup'
import type { GeometryKind, NodeType } from '../../sketch/types'

const GEOM_FILTERS = [
  { value: 'all' as const,     label: 'All' },
  { value: 'point' as const,   label: 'Pts' },
  { value: 'line' as const,    label: 'Lines' },
  { value: 'polygon' as const, label: 'Polys' },
  { value: 'solid' as const,   label: 'Solids' },
]

const SOLID_TYPES: NodeType[] = ['box', 'pit', 'cylinder', 'extrude']

export default function FeaturesTab() {
  const sketches = useCadEngine(s => s.sketches)
  const nodes = useCadEngine(s => s.nodes)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const selectedNodeId = useCadEngine(s => s.selectedNodeId)
  const selectNode = useCadEngine(s => s.selectNode)
  const removeNode = useCadEngine(s => s.removeNode)

  const [filter, setFilter] = useState<typeof GEOM_FILTERS[number]['value']>('all')

  const sketch = activeSketchId ? sketches[activeSketchId] : null

  const features = useMemo(() => {
    if (!sketch) return []
    const inSketch = Object.values(nodes).filter(n => n.params.sketchId === sketch.id)
    if (filter === 'all') return inSketch
    if (filter === 'solid') return inSketch.filter(n => SOLID_TYPES.includes(n.type))
    return inSketch.filter(n => n.params.geometry === filter)
  }, [sketch, nodes, filter])

  if (!sketch) {
    return (
      <div className="features-tab__empty">
        <p>No active sketch.</p>
      </div>
    )
  }

  return (
    <div className="features-tab">
      <ToggleGroup
        value={filter}
        onChange={setFilter}
        options={GEOM_FILTERS}
      />

      <div className="features-count">
        {features.length} feature{features.length === 1 ? '' : 's'}
      </div>

      <ul className="design-feature-list">
        {features.map(node => {
          const layer = sketch.layers.find(l => l.id === node.params.sketchLayer)
          const label = (node.attributes.name as string | undefined)
            || node.attributes.label as string | undefined
            || `${node.type}_${node.id.slice(-4)}`
          return (
            <li
              key={node.id}
              className={`design-feature-item${selectedNodeId === node.id ? ' selected' : ''}`}
              onClick={() => selectNode(selectedNodeId === node.id ? null : node.id)}
            >
              <span
                className="design-feature-icon"
                style={layer ? { color: layer.colour } : undefined}
              >
                {node.params.geometry === 'point' ? '●'
                  : node.params.geometry === 'line' ? '╱'
                  : node.params.geometry === 'polygon' ? '⬡'
                  : SOLID_TYPES.includes(node.type) ? '◧' : '◇'}
              </span>
              <span className="design-feature-label">{label}</span>
              <span className="design-feature-geom">{node.type}</span>
              <button
                className="design-feature-delete"
                title="Delete (cascades downstream)"
                onClick={e => { e.stopPropagation(); removeNode(node.id) }}
              >
                <Trash2 size={13} />
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
