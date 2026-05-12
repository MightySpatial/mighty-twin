/** LayersPanelBody — body slot for the FloatingSidePanel "Layers" tab.
 *
 *  Renders the layer list with eye-toggle + opacity sliders + per-row
 *  attribute-table trigger. The host owns the AttributeTable modal
 *  mount; this panel just calls `onShowAttributes(layerId)`.
 *
 *  Extracted from ViewerSidebar's LAYERS tab so the same content can
 *  render either as a side panel (desktop / tablet landscape) or as a
 *  bottom sheet (phone / tablet portrait) via FloatingSidePanel. */

import type { Layer } from '../../CesiumViewer/types'
import LayerItem from '../../../widgets/layers/LayerItem'
import './panels.css'

export interface LayersPanelBodyProps {
  layers: Layer[]
  loading?: boolean
  onLayerToggle?: (layerId: string) => void
  onLayerOpacityChange?: (layerId: string, opacity: number) => void
  onShowAttributes?: (layerId: string) => void
}

function LayerSkeleton() {
  return (
    <div className="layer-skeleton">
      {[1, 2, 3].map((i) => (
        <div key={i} className="layer-skeleton-item">
          <div className="layer-skeleton-icon" />
          <div className="layer-skeleton-text" />
          <div className="layer-skeleton-badge" />
        </div>
      ))}
    </div>
  )
}

export function LayersPanelBody({
  layers,
  loading = false,
  onLayerToggle,
  onLayerOpacityChange,
  onShowAttributes,
}: LayersPanelBodyProps) {
  if (loading && layers.length === 0) return <LayerSkeleton />
  if (layers.length === 0) return <div className="layer-empty">No layers configured</div>
  return (
    <div className="sidebar-layer-list">
      {[...layers]
        .sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
        .map((layer) => (
          <LayerItem
            key={layer.id}
            layer={layer}
            onToggle={onLayerToggle}
            onOpacityChange={onLayerOpacityChange}
            onShowAttributes={onShowAttributes}
          />
        ))}
    </div>
  )
}

export default LayersPanelBody
