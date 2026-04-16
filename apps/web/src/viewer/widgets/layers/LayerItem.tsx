import { Eye, EyeOff, Table2 } from 'lucide-react'
import type { Layer } from '../../components/CesiumViewer/types'
import PointSymbologyPicker from '../../shared/PointSymbologyPicker'
import { DEFAULT_POINT_SYMBOL } from '../../shared/pointSymbology'
import type { PointSymbolStyle, PointSymbolType } from '../../shared/pointSymbology'

interface LayerItemProps {
  layer: Layer
  onToggle?: (layerId: string) => void
  onOpacityChange?: (layerId: string, opacity: number) => void
  onShowAttributes?: (layerId: string) => void
  onStyleChange?: (layerId: string, patch: Record<string, unknown>) => void
}

function layerToPointSymbol(layer: Layer): PointSymbolStyle {
  const s = layer.style?.single
  return {
    symbolType: (s?.pointShape as PointSymbolType) || DEFAULT_POINT_SYMBOL.symbolType,
    size: s?.pointSize ?? DEFAULT_POINT_SYMBOL.size,
    fillColor: s?.fillColor ?? s?.strokeColor ?? layer.style?.color as string ?? DEFAULT_POINT_SYMBOL.fillColor,
    strokeColor: DEFAULT_POINT_SYMBOL.strokeColor,
    opacity: s?.opacity ?? layer.opacity ?? DEFAULT_POINT_SYMBOL.opacity,
  }
}

export default function LayerItem({ layer, onToggle, onOpacityChange, onShowAttributes, onStyleChange }: LayerItemProps) {
  const color = (layer.style?.single?.strokeColor ?? layer.style?.color as string) ?? '#6366f1'
  const opacityPct = Math.round((layer.opacity ?? 1) * 100)
  const isVector = layer.type === 'vector'

  return (
    <div className={`layer-item${!layer.visible ? ' layer-item--hidden' : ''}`}>
      <button
        className="layer-vis-btn"
        onClick={() => onToggle?.(layer.id)}
        title={layer.visible ? 'Hide layer' : 'Show layer'}
      >
        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <div className="layer-color-swatch" style={{ background: color, boxShadow: layer.visible ? `0 0 6px ${color}40` : 'none' }} />
      <span className="layer-name">{layer.name}</span>
      <span className="layer-type-badge">{layer.type}</span>
      {onShowAttributes && (
        <button
          className="layer-vis-btn"
          onClick={(e) => { e.stopPropagation(); onShowAttributes(layer.id) }}
          title="Attribute table"
        >
          <Table2 size={14} />
        </button>
      )}
      {onOpacityChange && layer.visible && (
        <div className="layer-opacity-row">
          <input
            type="range"
            className="layer-opacity-slider"
            min={0}
            max={100}
            value={opacityPct}
            onChange={e => onOpacityChange(layer.id, Number(e.target.value) / 100)}
            title={`Opacity: ${opacityPct}%`}
          />
          <span className="layer-opacity-val">{opacityPct}%</span>
        </div>
      )}
      {isVector && onStyleChange && layer.visible && (
        <div className="layer-point-style">
          <PointSymbologyPicker
            value={layerToPointSymbol(layer)}
            onChange={(ps) => {
              onStyleChange(layer.id, {
                single: {
                  ...layer.style?.single,
                  pointShape: ps.symbolType,
                  pointSize: ps.size,
                  fillColor: ps.fillColor,
                  opacity: ps.opacity,
                },
              })
            }}
          />
        </div>
      )}
    </div>
  )
}
