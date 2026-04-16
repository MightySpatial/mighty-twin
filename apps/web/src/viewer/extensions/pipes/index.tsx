/**
 * MightyTwin — Pipes Extension
 * Renders vector layers as 3D PolylineVolume pipes with depth mode support.
 *
 * Activates for layers where layer_metadata.renderAs === 'pipe'
 * OR layer_metadata.pipeRadiusM is set.
 */
import {
  Viewer as CesiumViewer,
  Cartesian3,
  Color,
  Entity,
} from 'cesium'
import { registerExtension, PanelProps, LayerHandle, ViewerContext } from '../types'
import type { Layer } from '../../components/CesiumViewer'
import type { GeoJSONFeatureCollection } from '../../types/api'
import {
  pipeSanitizePositions,
  applyPipeDepthOffsetCartesian,
  computePipeCircleShape,
  PIPE_DEPTH_MODES,
  type PipeDepthMode,
} from '../../utils/pipeUtils'

// ─── Pipe layer renderer ──────────────────────────────────────────────────────

function renderPipeLayer(layer: Layer, viewer: CesiumViewer): LayerHandle {
  const entities: Entity[] = []

  const radiusM = layer.layer_metadata?.pipeRadiusM ?? 0.15
  const depthMode: PipeDepthMode = (layer.layer_metadata?.pipeDepthMode as PipeDepthMode) ?? 'centerline'
  const wallThicknessM = layer.layer_metadata?.wallThicknessM ?? 0
  const colorHex = layer.style?.single?.strokeColor
    ?? layer.style?.color
    ?? '#3b82f6'
  const opacity = layer.opacity ?? 1

  const color = Color.fromCssColorString(colorHex).withAlpha(opacity)
  const shape = computePipeCircleShape(radiusM)

  function loadFeatures() {
    if (!layer.url) return
    fetch(layer.url, { credentials: 'include' })
      .then(r => r.json() as Promise<GeoJSONFeatureCollection>)
      .then(geojson => {
        const features = geojson.features ?? []
        features.forEach(feat => {
          if (!feat.geometry) return
          let coords: number[][] = []

          if (feat.geometry.type === 'LineString') {
            coords = feat.geometry.coordinates as unknown as number[][]
          } else if (feat.geometry.type === 'MultiLineString') {
            // Render each part separately
            ;(feat.geometry.coordinates as unknown as number[][][]).forEach(part => {
              renderSegment(part)
            })
            return
          } else {
            return // skip non-line features
          }

          renderSegment(coords)
        })
      })
      .catch(console.error)
  }

  function renderSegment(coords: number[][]) {
    // Convert to Cartesian3 — coords are [lon, lat, alt?]
    let positions = coords.map(c =>
      Cartesian3.fromDegrees(c[0], c[1], c[2] ?? 0)
    )

    // Sanitize (remove collinear/U-turn vertices)
    const sanitized = pipeSanitizePositions(positions)
    if (!sanitized) return

    // Apply depth mode offset
    const finalPositions = applyPipeDepthOffsetCartesian(sanitized, depthMode, radiusM, wallThicknessM)

    const entity = viewer.entities.add({
      polylineVolume: {
        positions: finalPositions,
        shape,
        material: color,
        outline: false,
        outlineColor: Color.BLACK,
      },
    })
    entities.push(entity)
  }

  loadFeatures()

  return {
    update: (_updated: Layer) => {
      // For now, full re-render on update
      entities.forEach(e => viewer.entities.remove(e))
      entities.length = 0
    },
    setVisible: (visible: boolean) => {
      entities.forEach(e => { if (e.show !== undefined) e.show = visible })
    },
    setOpacity: (_opacity: number) => {
      // Recreate with new opacity — simple approach
    },
    destroy: () => {
      entities.forEach(e => viewer.entities.remove(e))
      entities.length = 0
    },
  }
}

// ─── Panel UI ─────────────────────────────────────────────────────────────────

function PipesPanel({ onClose }: PanelProps) {
  return (
    <div className="ext-panel">
      <div className="ext-panel-header">
        <span>Pipes</span>
        <button className="ext-panel-close" onClick={onClose}>×</button>
      </div>
      <div className="ext-panel-body">
        <p className="ext-hint">
          Layers render as 3D pipes when <code>layer_metadata.renderAs = "pipe"</code> is set.<br /><br />
          Configure per layer in admin → Sites → Layers → metadata.
        </p>
        <div className="ext-field">
          <label className="ext-label">Depth Modes</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PIPE_DEPTH_MODES.map(mode => (
              <div key={mode} style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                <code style={{ color: '#a5b4fc' }}>{mode}</code>
                {mode === 'centerline' ? ' — default' :
                 mode === 'obvert' ? ' — inside top (crown)' :
                 mode === 'invert' ? ' — inside bottom' :
                 mode === 'outsideTop' ? ' — top of pipe exterior' :
                 ' — bottom of pipe exterior'}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Register ─────────────────────────────────────────────────────────────────

registerExtension({
  id: 'pipes',
  name: 'Pipes',
  version: '1.0.0',

  claimsLayer: (layer: Layer) => {
    return (
      layer.layer_metadata?.renderAs === 'pipe' ||
      typeof layer.layer_metadata?.pipeRadiusM === 'number'
    )
  },

  renderLayer: (layer: Layer, viewer: CesiumViewer, _context: ViewerContext): LayerHandle => {
    return renderPipeLayer(layer, viewer)
  },

  panel: {
    icon: <span style={{ fontSize: 14, fontWeight: 700 }}>⌀</span>,
    label: 'Pipes',
    component: PipesPanel,
  },
})
