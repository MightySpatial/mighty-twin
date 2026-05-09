/**
 * MightyTwin — Edit Panel (mirrors v1 PropertiesTab + DesignObjectEditor)
 *
 * Layout (when a feature is selected):
 *   1. Feature header (rename, geometry badge, delete)
 *   2. DesignObjectEditor (solids only) — dimensions / anchor / orientation /
 *      construction / appearance — every input rebuilds geometry on change.
 *   3. AttributesEditor — schema-driven + freeform attribute editing.
 *   4. Move modes — Coordinate / Bearing & Distance / ΔE/ΔN. v1's
 *      precision-transform pattern, kept verbatim from prior v2.
 *   5. Current position readout.
 */
import { useState, useEffect } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import type { SketchFeature, SketchLayer, FeatureStyle } from '../types'
import { geodesicOffset, enuDelta, getAnchor, GEOM_LABELS } from './editHelpers'
import DesignObjectEditor from './DesignObjectEditor'
import AttributesEditor from './AttributesEditor'

type MoveMode = 'coord' | 'bearing' | 'delta'

const SOLID_GEOMS = new Set(['box', 'pit', 'cylinder'])

interface EditPanelProps {
  feature: SketchFeature | null
  layers: SketchLayer[]
  viewer: CesiumViewerType
  onMoveFeature: (id: string, lon: number, lat: number, alt: number) => void
  onDelete: (id: string) => void
  onRename: (id: string, label: string) => void
  onUpdateParams: (id: string, patch: Record<string, unknown>) => void
  onUpdateAttribute: (id: string, key: string, value: unknown) => void
  onUpdateStyle: (id: string, patch: Partial<FeatureStyle>) => void
}

export default function EditPanel({
  feature,
  layers,
  viewer,
  onMoveFeature,
  onDelete,
  onRename,
  onUpdateParams,
  onUpdateAttribute,
  onUpdateStyle,
}: EditPanelProps) {
  const [moveMode, setMoveMode] = useState<MoveMode>('coord')
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Coord mode
  const [cLon, setCLon] = useState('')
  const [cLat, setCLat] = useState('')
  const [cAlt, setCAlt] = useState('')

  // Bearing+Distance mode
  const [bBearing, setBBearing] = useState('')
  const [bDist, setBDist] = useState('')
  const [bAltDelta, setBAltDelta] = useState('0')

  // Delta mode
  const [dE, setDE] = useState('')
  const [dN, setDN] = useState('')
  const [dAlt, setDAlt] = useState('0')

  const [anchor, setAnchor] = useState<[number, number, number] | null>(null)

  useEffect(() => {
    if (!feature) { setAnchor(null); return }
    const a = getAnchor(feature, viewer)
    setAnchor(a)
    if (a) {
      setCLon(a[0].toFixed(6))
      setCLat(a[1].toFixed(6))
      setCAlt(a[2].toFixed(2))
    }
    setLabelDraft(feature.label)
    setEditingLabel(false)
    setConfirmDelete(false)
  }, [feature?.id, viewer])

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
  const featureLayer = layers.find(l => l.id === feature.layerId)
  const layerFields = featureLayer?.fields ?? []

  function commitLabel() {
    if (labelDraft.trim() && labelDraft !== feature!.label) {
      onRename(feature!.id, labelDraft.trim())
    }
    setEditingLabel(false)
  }

  function applyCoord() {
    const lon = parseFloat(cLon)
    const lat = parseFloat(cLat)
    const alt = parseFloat(cAlt)
    if (isNaN(lon) || isNaN(lat) || isNaN(alt)) return
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return
    onMoveFeature(feature!.id, lon, lat, alt)
    setAnchor([lon, lat, alt])
  }

  function applyBearing() {
    if (!anchor) return
    const bearing = parseFloat(bBearing)
    const dist = parseFloat(bDist)
    const altD = parseFloat(bAltDelta) || 0
    if (isNaN(bearing) || isNaN(dist)) return
    const [lon, lat, alt] = geodesicOffset(anchor[0], anchor[1], anchor[2], bearing, dist, altD)
    onMoveFeature(feature!.id, lon, lat, alt)
    setAnchor([lon, lat, alt])
    setCLon(lon.toFixed(6)); setCLat(lat.toFixed(6)); setCAlt(alt.toFixed(2))
  }

  function applyDelta() {
    if (!anchor) return
    const e = parseFloat(dE) || 0
    const n = parseFloat(dN) || 0
    const a = parseFloat(dAlt) || 0
    const [lon, lat, alt] = enuDelta(anchor[0], anchor[1], anchor[2], e, n, a)
    onMoveFeature(feature!.id, lon, lat, alt)
    setAnchor([lon, lat, alt])
    setCLon(lon.toFixed(6)); setCLat(lat.toFixed(6)); setCAlt(alt.toFixed(2))
  }

  return (
    <div className="edit-panel">
      {/* Feature header */}
      <div className="edit-feature-header">
        {editingLabel ? (
          <input
            className="edit-label-input"
            value={labelDraft}
            autoFocus
            onChange={e => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={e => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') setEditingLabel(false) }}
          />
        ) : (
          <button className="edit-label-btn" title="Click to rename" onClick={() => { setEditingLabel(true); setLabelDraft(feature.label) }}>
            {feature.label}
            <span className="edit-label-pencil">✎</span>
          </button>
        )}
        <span className="geometry-badge" data-geom={feature.geometry}>
          {GEOM_LABELS[feature.geometry] ?? feature.geometry}
        </span>
        {!confirmDelete ? (
          <button className="edit-delete-btn" title="Delete feature" onClick={() => setConfirmDelete(true)}>🗑</button>
        ) : (
          <span className="edit-delete-confirm">
            <button className="edit-delete-yes" onClick={() => { onDelete(feature.id); setConfirmDelete(false) }}>Delete</button>
            <button className="edit-delete-no" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </span>
        )}
      </div>

      <div className="edit-divider" />

      {/* Properties — solids get full DesignObjectEditor */}
      {isSolid && (
        <>
          <DesignObjectEditor feature={feature} onParamChange={onUpdateParams} />

          {/* Appearance — single colour + opacity, mirrors v1 doe-appearance. */}
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
                  value={Math.round(feature.style.opacity * 100)}
                  onChange={e => onUpdateStyle(feature.id, { opacity: Number(e.target.value) / 100 })}
                />
                <span className="doe-opacity-label">{Math.round(feature.style.opacity * 100)}%</span>
              </div>
            </div>
          </div>
          <div className="edit-divider" />
        </>
      )}

      {/* Attributes — schema-driven + freeform */}
      <div className="edit-section-label">Attributes</div>
      <AttributesEditor
        feature={feature}
        fields={layerFields}
        onUpdateAttribute={onUpdateAttribute}
      />

      <div className="edit-divider" />

      <p className="edit-drag-hint">Drag on the map to move, or enter precise values below.</p>

      <div className="move-mode-tabs">
        {(['coord', 'bearing', 'delta'] as MoveMode[]).map(m => (
          <button
            key={m}
            className={`move-mode-tab${moveMode === m ? ' active' : ''}`}
            onClick={() => setMoveMode(m)}
          >
            {m === 'coord' ? 'Coordinate' : m === 'bearing' ? 'Bearing & Dist' : 'ΔE / ΔN'}
          </button>
        ))}
      </div>

      {moveMode === 'coord' && (
        <div className="move-inputs">
          <div className="move-input-group">
            <label>Latitude</label>
            <input type="number" step="0.000001" value={cLat} onChange={e => setCLat(e.target.value)} placeholder="-33.865" />
            <span className="move-unit">°</span>
          </div>
          <div className="move-input-group">
            <label>Longitude</label>
            <input type="number" step="0.000001" value={cLon} onChange={e => setCLon(e.target.value)} placeholder="151.209" />
            <span className="move-unit">°</span>
          </div>
          <div className="move-input-group">
            <label>Altitude</label>
            <input type="number" step="0.01" value={cAlt} onChange={e => setCAlt(e.target.value)} placeholder="0.00" />
            <span className="move-unit">m</span>
          </div>
          <button className="move-apply-btn" onClick={applyCoord}>Apply</button>
        </div>
      )}

      {moveMode === 'bearing' && (
        <div className="move-inputs">
          <div className="move-input-group">
            <label>Bearing</label>
            <input type="number" step="0.1" min="0" max="360" value={bBearing} onChange={e => setBBearing(e.target.value)} placeholder="45.0" />
            <span className="move-unit">°</span>
          </div>
          <div className="move-input-group">
            <label>Distance</label>
            <input type="number" step="0.01" min="0" value={bDist} onChange={e => setBDist(e.target.value)} placeholder="100.00" />
            <span className="move-unit">m</span>
          </div>
          <div className="move-input-group">
            <label>Elevation Δ</label>
            <input type="number" step="0.01" value={bAltDelta} onChange={e => setBAltDelta(e.target.value)} placeholder="0.00" />
            <span className="move-unit">m</span>
          </div>
          <button className="move-apply-btn" onClick={applyBearing}>Apply</button>
        </div>
      )}

      {moveMode === 'delta' && (
        <div className="move-inputs">
          <div className="move-input-group">
            <label>ΔEasting</label>
            <input type="number" step="0.01" value={dE} onChange={e => setDE(e.target.value)} placeholder="0.00" />
            <span className="move-unit">m E</span>
          </div>
          <div className="move-input-group">
            <label>ΔNorthing</label>
            <input type="number" step="0.01" value={dN} onChange={e => setDN(e.target.value)} placeholder="0.00" />
            <span className="move-unit">m N</span>
          </div>
          <div className="move-input-group">
            <label>ΔAltitude</label>
            <input type="number" step="0.01" value={dAlt} onChange={e => setDAlt(e.target.value)} placeholder="0.00" />
            <span className="move-unit">m</span>
          </div>
          <button className="move-apply-btn" onClick={applyDelta}>Apply</button>
        </div>
      )}

      {anchor && (
        <div className="current-position">
          <span className="cur-pos-label">Current position</span>
          <span className="cur-pos-value">
            {anchor[1].toFixed(6)}°, {anchor[0].toFixed(6)}°
          </span>
          <span className="cur-pos-alt">{anchor[2].toFixed(2)} m alt</span>
        </div>
      )}
    </div>
  )
}
