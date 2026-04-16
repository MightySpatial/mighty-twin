/**
 * MightyTwin — Design History Panel
 * Lists all placed features grouped by sketch layer.
 */
import { Trash2 } from 'lucide-react'
import type { SketchFeature, SketchLayer } from '../types'

interface HistoryPanelProps {
  groups: Array<{ layer: SketchLayer; features: SketchFeature[] }>
  selectedFeatureId: string | null
  onSelect: (featureId: string | null) => void
  onDelete: (featureId: string) => void
  onToggleCollapse: (layerId: string) => void
}

const GEOM_ICONS: Record<string, string> = {
  point: '●',
  line: '╱',
  polygon: '⬡',
  rectangle: '▣',
  circle: '◯',
  traverse: '⟡',
  box: '⬒',
  pit: '⊟',
  cylinder: '⊙',
  other: '◇',
}

export default function HistoryPanel({
  groups,
  selectedFeatureId,
  onSelect,
  onDelete,
  onToggleCollapse,
}: HistoryPanelProps) {
  if (groups.length === 0) {
    return (
      <div className="design-history-empty">
        No features placed yet. Use the sketching tools to add geometry to the scene.
      </div>
    )
  }

  return (
    <div className="design-history">
      {groups.map(({ layer, features }) => (
        <div key={layer.id} className="design-layer-group">
          <div
            className="design-layer-header"
            onClick={() => onToggleCollapse(layer.id)}
          >
            <span className="design-layer-chevron">
              {layer.collapsed ? '▸' : '▾'}
            </span>
            <span className="design-layer-dot" style={{ background: layer.colour }} />
            <span className="design-layer-name">{layer.name}</span>
            <span className="design-layer-count">{features.length}</span>
          </div>

          {!layer.collapsed && (
            <ul className="design-feature-list">
              {features.map(feat => (
                <li
                  key={feat.id}
                  className={`design-feature-item${selectedFeatureId === feat.id ? ' selected' : ''}`}
                  onClick={() => onSelect(selectedFeatureId === feat.id ? null : feat.id)}
                >
                  <span className="design-feature-icon">
                    {GEOM_ICONS[feat.geometry] ?? GEOM_ICONS.other}
                  </span>
                  <span className="design-feature-label">{feat.label}</span>
                  <span className="design-feature-geom">{feat.geometry}</span>
                  <button
                    className="design-feature-delete"
                    title="Delete feature"
                    onClick={e => { e.stopPropagation(); onDelete(feat.id) }}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
