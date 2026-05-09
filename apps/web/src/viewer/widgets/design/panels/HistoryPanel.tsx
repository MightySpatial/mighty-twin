/**
 * MightyTwin — Design History Panel
 *
 * View-mode toggle (By Layer / By Type) atop a collapsible feature tree.
 * All grouping logic lives in `history/groupings.ts`; the row + header are
 * their own components.
 */
import { useMemo, useState } from 'react'
import type { SketchFeature, SketchLayer } from '../types'
import ToggleGroup from '../primitives/ToggleGroup'
import FeatureListItem from './history/FeatureListItem'
import LayerGroupHeader from './history/LayerGroupHeader'
import {
  bucketFeaturesByGeomKind,
  GEOM_GROUP_LABELS,
  GEOM_KIND_ORDER,
  type GeomKind,
} from './history/groupings'

type ViewMode = 'layer' | 'type'

interface Props {
  groups: Array<{ layer: SketchLayer; features: SketchFeature[] }>
  selectedFeatureId: string | null
  onSelect: (featureId: string | null) => void
  onDelete: (featureId: string) => void
  onToggleCollapse: (layerId: string) => void
}

export default function HistoryPanel({
  groups, selectedFeatureId, onSelect, onDelete, onToggleCollapse,
}: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('layer')
  const [geomCollapsed, setGeomCollapsed] = useState<Record<string, boolean>>({})

  const allFeatures = useMemo(() => groups.flatMap(g => g.features), [groups])
  const featuresByGeom = useMemo(() => bucketFeaturesByGeomKind(allFeatures), [allFeatures])

  if (groups.length === 0) {
    return (
      <div className="design-history-empty">
        No features placed yet. Use the sketching tools to add geometry to the scene.
      </div>
    )
  }

  return (
    <div className="design-history">
      <ToggleGroup<ViewMode>
        value={viewMode}
        onChange={setViewMode}
        options={[
          { value: 'layer', label: 'By Layer' },
          { value: 'type',  label: 'By Type'  },
        ]}
        ariaLabel="History view mode"
      />

      {viewMode === 'layer' && groups.map(({ layer, features }) => (
        <div key={layer.id} className="design-layer-group">
          <LayerGroupHeader
            collapsed={!!layer.collapsed}
            onToggle={() => onToggleCollapse(layer.id)}
            colour={layer.colour}
            name={layer.name}
            count={features.length}
          />
          {!layer.collapsed && (
            <ul className="design-feature-list">
              {features.map(feat => (
                <FeatureListItem
                  key={feat.id}
                  feature={feat}
                  selected={selectedFeatureId === feat.id}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              ))}
            </ul>
          )}
        </div>
      ))}

      {viewMode === 'type' && GEOM_KIND_ORDER.map((kind: GeomKind) => {
        const list = featuresByGeom[kind]
        if (list.length === 0) return null
        const collapsed = !!geomCollapsed[kind]
        return (
          <div key={kind} className="design-layer-group">
            <LayerGroupHeader
              collapsed={collapsed}
              onToggle={() => setGeomCollapsed(s => ({ ...s, [kind]: !collapsed }))}
              name={GEOM_GROUP_LABELS[kind]}
              count={list.length}
            />
            {!collapsed && (
              <ul className="design-feature-list">
                {list.map(feat => (
                  <FeatureListItem
                    key={feat.id}
                    feature={feat}
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
    </div>
  )
}
