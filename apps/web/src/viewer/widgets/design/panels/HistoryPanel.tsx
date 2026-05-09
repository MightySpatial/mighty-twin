/**
 * MightyTwin — Design History Panel (faithful port of v1 HistoryTab).
 *
 * v1 patterns ported:
 *   • View-mode toggle: By Layer / By Type (etog-btn)
 *   • By-Layer view: collapsible groups per layer with colour dot + count
 *   • By-Type view: collapsible groups per geometry kind (point/line/polygon/solid/other)
 *   • Per-row inline action (Delete) on hover
 *
 * Backend-dependent v1 features omitted because v2 doesn't have them yet:
 *   • Live history toggle / Rebuild button (no DAG re-evaluation in v2)
 *   • Stale node badges (no DAG)
 *   • Orphan badges (no redline schema)
 *   • Schema editor button on orphans
 */
import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { SketchFeature, SketchLayer } from '../types'

type ViewMode = 'layer' | 'type'

type GeomKind = 'point' | 'line' | 'polygon' | 'solid' | 'other'

const GEOM_KIND: Record<string, GeomKind> = {
  point: 'point',
  line: 'line',
  traverse: 'line',
  polygon: 'polygon',
  rectangle: 'polygon',
  circle: 'polygon',
  box: 'solid',
  pit: 'solid',
  cylinder: 'solid',
}

const GEOM_GROUP_LABELS: Record<GeomKind, string> = {
  point: 'Points',
  line: 'Lines',
  polygon: 'Polygons',
  solid: 'Solids',
  other: 'Other',
}

const GEOM_ICONS: Record<string, string> = {
  point: '●', line: '╱', polygon: '⬡', rectangle: '▣', circle: '◯', traverse: '⟡',
  box: '⬒', pit: '⊟', cylinder: '⊙', other: '◇',
}

interface HistoryPanelProps {
  groups: Array<{ layer: SketchLayer; features: SketchFeature[] }>
  selectedFeatureId: string | null
  onSelect: (featureId: string | null) => void
  onDelete: (featureId: string) => void
  onToggleCollapse: (layerId: string) => void
}

export default function HistoryPanel({
  groups,
  selectedFeatureId,
  onSelect,
  onDelete,
  onToggleCollapse,
}: HistoryPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('layer')
  const [geomCollapsed, setGeomCollapsed] = useState<Record<string, boolean>>({})

  const allFeatures = useMemo(() => groups.flatMap(g => g.features), [groups])

  const featuresByGeom = useMemo(() => {
    const out: Record<GeomKind, SketchFeature[]> = { point: [], line: [], polygon: [], solid: [], other: [] }
    for (const f of allFeatures) {
      const kind = GEOM_KIND[f.geometry] ?? 'other'
      out[kind].push(f)
    }
    return out
  }, [allFeatures])

  if (groups.length === 0) {
    return (
      <div className="design-history-empty">
        No features placed yet. Use the sketching tools to add geometry to the scene.
      </div>
    )
  }

  return (
    <div className="design-history">
      {/* View-mode toggle (v1 etog-btn pattern) */}
      <div className="hist-view-toggle">
        <button
          className={`etog-btn${viewMode === 'layer' ? ' on' : ''}`}
          onClick={() => setViewMode('layer')}
        >By Layer</button>
        <button
          className={`etog-btn${viewMode === 'type' ? ' on' : ''}`}
          onClick={() => setViewMode('type')}
        >By Type</button>
      </div>

      {viewMode === 'layer' && (
        <>
          {groups.map(({ layer, features }) => (
            <div key={layer.id} className="design-layer-group">
              <div className="design-layer-header" onClick={() => onToggleCollapse(layer.id)}>
                <span className="design-layer-chevron">{layer.collapsed ? '▸' : '▾'}</span>
                <span className="design-layer-dot" style={{ background: layer.colour }} />
                <span className="design-layer-name">{layer.name}</span>
                <span className="design-layer-count">{features.length}</span>
              </div>
              {!layer.collapsed && (
                <ul className="design-feature-list">
                  {features.map(feat => (
                    <FeatureRow
                      key={feat.id}
                      feat={feat}
                      selected={selectedFeatureId === feat.id}
                      onSelect={onSelect}
                      onDelete={onDelete}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </>
      )}

      {viewMode === 'type' && (
        <>
          {(['point', 'line', 'polygon', 'solid', 'other'] as GeomKind[]).map(kind => {
            const list = featuresByGeom[kind]
            if (list.length === 0) return null
            const collapsed = !!geomCollapsed[kind]
            return (
              <div key={kind} className="design-layer-group">
                <div
                  className="design-layer-header"
                  onClick={() => setGeomCollapsed(s => ({ ...s, [kind]: !collapsed }))}
                >
                  <span className="design-layer-chevron">{collapsed ? '▸' : '▾'}</span>
                  <span className="design-layer-name">{GEOM_GROUP_LABELS[kind]}</span>
                  <span className="design-layer-count">{list.length}</span>
                </div>
                {!collapsed && (
                  <ul className="design-feature-list">
                    {list.map(feat => (
                      <FeatureRow
                        key={feat.id}
                        feat={feat}
                        selected={selectedFeatureId === feat.id}
                        onSelect={onSelect}
                        onDelete={onDelete}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

function FeatureRow({
  feat, selected, onSelect, onDelete,
}: {
  feat: SketchFeature
  selected: boolean
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
}) {
  return (
    <li
      className={`design-feature-item${selected ? ' selected' : ''}`}
      onClick={() => onSelect(selected ? null : feat.id)}
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
  )
}
