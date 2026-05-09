/**
 * MightyTwin — Edit Panel
 *
 * Composes:
 *   • FeatureHeader       — rename + geometry badge + delete confirm
 *   • DesignObjectEditor  — solids: dimensions, anchor, orientation, construction
 *   • Appearance row      — colour + opacity (solids only)
 *   • AttributesEditor    — schema-driven + freeform attribute editing
 *   • MoveModeTabs        — Coordinate / Bearing+Dist / ΔE/ΔN, driven by useMoveControls
 *   • Current-position readout
 *
 * State + math live in `edit/useMoveControls.ts`.
 */
import type { Viewer as CesiumViewerType } from 'cesium'
import type { SketchFeature, SketchLayer, FeatureStyle } from '../types'
import DesignObjectEditor from './DesignObjectEditor'
import AttributesEditor from './AttributesEditor'
import FeatureHeader from './edit/FeatureHeader'
import MoveModeTabs from './edit/MoveModeTabs'
import { useMoveControls } from './edit/useMoveControls'

const SOLID_GEOMS = new Set(['box', 'pit', 'cylinder'])

interface Props {
  feature: SketchFeature | null
  layers: SketchLayer[]
  viewer: CesiumViewerType
  onMoveFeature: (id: string, lon: number, lat: number, alt: number) => void
  onDelete: (id: string) => void
  onRename: (id: string, label: string) => void
  onUpdateParams: (id: string, patch: Record<string, unknown>) => void
  onUpdateAttribute: (id: string, key: string, value: unknown) => void
  onUpdateStyle: (id: string, patch: Partial<FeatureStyle>) => void
  onSnapToTerrain: (id: string) => void
  siteSlug?: string | null
}

export default function EditPanel({
  feature, layers, viewer,
  onMoveFeature, onDelete, onRename,
  onUpdateParams, onUpdateAttribute, onUpdateStyle, onSnapToTerrain,
  siteSlug = null,
}: Props) {
  const move = useMoveControls({ feature, viewer, onMoveFeature })

  if (!feature) {
    return (
      <div className="edit-empty-state">
        <div className="edit-empty-icon">⊞</div>
        <p className="edit-empty-text">Click a feature on the map to select it.</p>
        <p className="edit-empty-hint">Then drag it, or enter precise coordinates below.</p>
      </div>
    )
  }

  const isSolid = SOLID_GEOMS.has(feature.geometry)
  const layerFields = layers.find(l => l.id === feature.layerId)?.fields ?? []

  return (
    <div className="edit-panel">
      <FeatureHeader feature={feature} onRename={onRename} onDelete={onDelete} />

      <div className="edit-divider" />

      {isSolid && (
        <>
          <DesignObjectEditor feature={feature} onParamChange={onUpdateParams} onSnapToTerrain={onSnapToTerrain} />
          <AppearanceRow feature={feature} onUpdateStyle={onUpdateStyle} />
          <div className="edit-divider" />
        </>
      )}

      <div className="edit-section-label">Attributes</div>
      <AttributesEditor
        feature={feature}
        fields={layerFields}
        onUpdateAttribute={onUpdateAttribute}
        siteSlug={siteSlug}
      />

      <div className="edit-divider" />

      <p className="edit-drag-hint">Drag on the map to move, or enter precise values below.</p>

      <MoveModeTabs
        mode={move.mode}
        onModeChange={move.setMode}
        coord={move.coord}
        bearing={move.bearing}
        delta={move.delta}
      />

      {move.anchor && <CurrentPosition anchor={move.anchor} />}
    </div>
  )
}

function AppearanceRow({ feature, onUpdateStyle }: { feature: SketchFeature; onUpdateStyle: (id: string, patch: Partial<FeatureStyle>) => void }) {
  const opacity = feature.style.opacity
  return (
    <div className="doe doe--appearance">
      <div className="doe-group">
        <div className="doe-group-label">Appearance</div>
        <div className="doe-appearance">
          <input
            type="color"
            className="doe-color"
            value={feature.style.fillColor}
            onChange={e => onUpdateStyle(feature.id, { fillColor: e.target.value, strokeColor: e.target.value })}
          />
          <input
            type="range"
            className="doe-opacity-slider"
            min={0}
            max={100}
            value={Math.round(opacity * 100)}
            onChange={e => onUpdateStyle(feature.id, { opacity: Number(e.target.value) / 100 })}
          />
          <span className="doe-opacity-label">{Math.round(opacity * 100)}%</span>
        </div>
      </div>
    </div>
  )
}

function CurrentPosition({ anchor }: { anchor: [number, number, number] }) {
  return (
    <div className="current-position">
      <span className="cur-pos-label">Current position</span>
      <span className="cur-pos-value">
        {anchor[1].toFixed(6)}°, {anchor[0].toFixed(6)}°
      </span>
      <span className="cur-pos-alt">{anchor[2].toFixed(2)} m alt</span>
    </div>
  )
}
