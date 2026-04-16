import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Layer } from '../../components/CesiumViewer/types'
import type { LayerStyle } from '../../types/api'

interface LegendWidgetProps {
  layers: Layer[]
  onClose: () => void
}

/** Geometry icon for layer type */
function layerTypeIcon(type: Layer['type']): string {
  switch (type) {
    case 'vector': return '◆'
    case 'raster': return '▦'
    case '3d-tiles': return '▣'
    case 'wms': case 'wmts': return '▧'
    case 'terrain': return '▲'
    case 'splat': return '◎'
    default: return '■'
  }
}

function SingleSymbol({ style }: { style: LayerStyle['single'] }) {
  if (!style) return null
  const stroke = style.strokeColor ?? '#6366f1'
  const fill = style.fillColor ?? stroke
  return (
    <div className="legend-symbol-row">
      <span
        className="legend-swatch"
        style={{
          background: fill,
          borderColor: stroke,
          opacity: style.opacity ?? 1,
        }}
      />
      <span className="legend-symbol-label">All features</span>
    </div>
  )
}

function CategorizedSymbol({ cat }: { cat: NonNullable<LayerStyle['categorized']> }) {
  return (
    <div className="legend-category-list">
      {cat.categories.map((c, i) => (
        <div key={i} className="legend-symbol-row">
          <span className="legend-swatch" style={{ background: c.color, borderColor: c.color }} />
          <span className="legend-symbol-label">{c.label || String(c.value ?? 'Other')}</span>
        </div>
      ))}
      {cat.default && (
        <div className="legend-symbol-row">
          <span className="legend-swatch" style={{ background: cat.default, borderColor: cat.default }} />
          <span className="legend-symbol-label">Other</span>
        </div>
      )}
    </div>
  )
}

function GraduatedSymbol({ grad }: { grad: NonNullable<LayerStyle['graduated']> }) {
  return (
    <div className="legend-category-list">
      {grad.breaks.map((b, i) => (
        <div key={i} className="legend-symbol-row">
          <span className="legend-swatch" style={{ background: b.color, borderColor: b.color }} />
          <span className="legend-symbol-label">{b.label || `${b.min} – ${b.max}`}</span>
        </div>
      ))}
    </div>
  )
}

function LegendLayerEntry({ layer }: { layer: Layer }) {
  const [expanded, setExpanded] = useState(true)
  const style = layer.style
  const renderType = style?.renderType ?? 'single'
  const hasDetail = renderType === 'categorized' ? !!style?.categorized?.categories.length
    : renderType === 'graduated' ? !!style?.graduated?.breaks.length
    : true

  const color = style?.single?.strokeColor ?? style?.color ?? '#6366f1'

  return (
    <div className="legend-layer">
      <div className="legend-layer-header" onClick={() => hasDetail && setExpanded(e => !e)}>
        {hasDetail ? (
          expanded ? <ChevronDown size={12} className="legend-chevron" /> : <ChevronRight size={12} className="legend-chevron" />
        ) : (
          <span style={{ width: 12 }} />
        )}
        <span className="legend-layer-icon" style={{ color }}>{layerTypeIcon(layer.type)}</span>
        <span className="legend-layer-name">{layer.name}</span>
        {!layer.visible && <span className="legend-hidden-badge">hidden</span>}
      </div>
      {expanded && hasDetail && (
        <div className="legend-layer-body">
          {renderType === 'categorized' && style?.categorized ? (
            <CategorizedSymbol cat={style.categorized} />
          ) : renderType === 'graduated' && style?.graduated ? (
            <GraduatedSymbol grad={style.graduated} />
          ) : (
            <SingleSymbol style={style?.single ?? { strokeColor: color }} />
          )}
        </div>
      )}
    </div>
  )
}

export default function LegendWidget({ layers, onClose }: LegendWidgetProps) {
  const visibleFirst = useMemo(
    () => [...layers].sort((a, b) => {
      if (a.visible !== b.visible) return a.visible ? -1 : 1
      return (a.order ?? 0) - (b.order ?? 0)
    }),
    [layers],
  )

  return (
    <div className="legend-panel">
      <div className="legend-panel-header">
        <span>Legend</span>
        <button className="ext-panel-close" onClick={onClose}>×</button>
      </div>
      <div className="legend-panel-body">
        {visibleFirst.length === 0 ? (
          <p className="legend-empty">No layers loaded</p>
        ) : (
          visibleFirst.map(layer => (
            <LegendLayerEntry key={layer.id} layer={layer} />
          ))
        )}
      </div>
    </div>
  )
}
