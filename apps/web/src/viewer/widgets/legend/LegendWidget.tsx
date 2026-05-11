import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Layer } from '../../components/CesiumViewer/types'
import type { LayerStyle } from '../../types/api'

/** Session-scoped persistence — Legend remembers its last drag
 *  position within a tab but doesn't survive a reload (matches MAI). */
const LEGEND_POS_KEY = 'mighty:legend:pos'
function loadLegendPos(): { x: number; y: number } | null {
  try {
    const raw = sessionStorage.getItem(LEGEND_POS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function saveLegendPos(p: { x: number; y: number }) {
  try { sessionStorage.setItem(LEGEND_POS_KEY, JSON.stringify(p)) } catch {}
}
/** Default anchor — bottom-left of the viewport, matching the
 *  original absolute CSS position (left: 16, bottom: 32) so users
 *  who never drag see the legend exactly where it always was. */
function defaultLegendPos() {
  if (typeof window === 'undefined') return { x: 16, y: 0 }
  // The legend is ~260 wide, ~variable height; pick a sensible top
  // ~32px above the bottom of the viewport.
  return { x: 16, y: Math.max(80, window.innerHeight - 360) }
}

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

  // Draggable position — pointer-events drag from the header grip
  // matches MAI's pattern (one handler for mouse + touch, position
  // persisted to sessionStorage). The panel's CSS becomes
  // position: fixed so left/top here are viewport coordinates.
  const [pos, setPos] = useState(() => loadLegendPos() ?? defaultLegendPos())
  const drag = useRef({ px: 0, py: 0, ox: 0, oy: 0, pointerId: -1, moved: false })

  const clamp = useCallback((p: { x: number; y: number }) => ({
    x: Math.max(0, Math.min(window.innerWidth - 100, p.x)),
    y: Math.max(0, Math.min(window.innerHeight - 60, p.y)),
  }), [])

  useEffect(() => {
    const onResize = () => setPos(prev => clamp(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only initiate drag when the user grabs the header itself,
    // not when they click the × close button inside it.
    if ((e.target as HTMLElement).closest('button')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      px: e.clientX, py: e.clientY,
      ox: pos.x, oy: pos.y,
      pointerId: e.pointerId, moved: false,
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current.pointerId) return
    const dx = e.clientX - drag.current.px
    const dy = e.clientY - drag.current.py
    if (!drag.current.moved && Math.hypot(dx, dy) < 4) return
    drag.current.moved = true
    const next = clamp({ x: drag.current.ox + dx, y: drag.current.oy + dy })
    setPos(next)
    saveLegendPos(next)
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== drag.current.pointerId) return
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch { /* released */ }
    drag.current.pointerId = -1
  }

  return (
    <div
      className="legend-panel legend-panel--draggable"
      style={{ left: pos.x, top: pos.y, bottom: 'auto' }}
    >
      <div
        className="legend-panel-header"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: 'grab', touchAction: 'none' }}
        title="Drag to reposition"
      >
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
