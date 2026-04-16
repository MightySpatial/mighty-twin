import { useState } from 'react'
import { Layers } from 'lucide-react'
import type { Layer } from '../../components/CesiumViewer/types'
import { AttributeTable } from '@mightydt/ui'
import LayerItem from './LayerItem'

function LayerSkeleton() {
  return (
    <div className="layer-skeleton">
      {[1, 2, 3].map(i => (
        <div key={i} className="layer-skeleton-item">
          <div className="layer-skeleton-icon" />
          <div className="layer-skeleton-text" />
          <div className="layer-skeleton-badge" />
        </div>
      ))}
    </div>
  )
}

interface LayersPanelProps {
  layers: Layer[]
  loading?: boolean
  layerPanelOpen: boolean
  setLayerPanelOpen: (open: boolean) => void
  isMobile: boolean
  onLayerToggle?: (layerId: string) => void
  onLayerOpacityChange?: (layerId: string, opacity: number) => void
}

export default function LayersPanel({
  layers,
  loading = false,
  layerPanelOpen,
  setLayerPanelOpen,
  isMobile,
  onLayerToggle,
  onLayerOpacityChange,
}: LayersPanelProps) {
  const [attrLayerId, setAttrLayerId] = useState<string | null>(null)

  return (
    <>
      {/* Layer Panel Toggle */}
      <button className="layer-toggle-btn" onClick={() => setLayerPanelOpen(!layerPanelOpen)} title="Layers (L)">
        <Layers size={20} />
      </button>

      {/* Layer Panel */}
      {layerPanelOpen && (
        <div className="layer-panel">
          <div className="layer-panel-header">
            <h3>Layers{layers.length > 0 && <span className="layer-count-badge">{layers.length}</span>}</h3>
            {isMobile && (
              <button className="layer-panel-close" onClick={() => setLayerPanelOpen(false)}>×</button>
            )}
          </div>
          <div className="layer-list">
            {loading && layers.length === 0 ? (
              <LayerSkeleton />
            ) : layers.length === 0 ? (
              <div className="layer-empty">No layers configured</div>
            ) : (
              [...layers].sort((a, b) => (b.order ?? 0) - (a.order ?? 0)).map(layer => (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  onToggle={onLayerToggle}
                  onOpacityChange={onLayerOpacityChange}
                  onShowAttributes={setAttrLayerId}
                />
              ))
            )}
          </div>
        </div>
      )}

      {/* Attribute Table Modal */}
      {attrLayerId && (
        <AttributeTable
          layerId={attrLayerId}
          layerName={layers.find(l => l.id === attrLayerId)?.name ?? ""}
          fetchAttributes={async (id) => {
            const r = await fetch(`/api/data-sources/${id}/attributes`, { credentials: "include" })
            const data = await r.json()
            return data.features ?? []
          }}
          onClose={() => setAttrLayerId(null)}
          viewerUrl={`/viewer?layer=${attrLayerId}&mode=view`}
        />
      )}
    </>
  )
}
