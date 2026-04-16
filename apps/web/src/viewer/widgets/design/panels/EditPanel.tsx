/**
 * MightyTwin — Edit Panel
 * Shown when the Edit rail tab is active.
 * Displays selected feature info + 3 precise move input modes:
 *   Coordinate | Bearing & Distance | Delta (ΔE/ΔN/ΔAlt)
 * All modes include elevation (altitude) control.
 */
import { useState, useEffect } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import type { SketchFeature } from '../types'
import { geodesicOffset, enuDelta, getAnchor, GEOM_LABELS } from './editHelpers'

type MoveMode = 'coord' | 'bearing' | 'delta'

// ── Component ─────────────────────────────────────────────────────────────────

interface EditPanelProps {
  feature: SketchFeature | null
  viewer: CesiumViewerType
  onMoveFeature: (id: string, lon: number, lat: number, alt: number) => void
  onDelete: (id: string) => void
  onRename: (id: string, label: string) => void
}

export default function EditPanel({ feature, viewer, onMoveFeature, onDelete, onRename }: EditPanelProps) {
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

  // Current anchor readout
  const [anchor, setAnchor] = useState<[number, number, number] | null>(null)

  // Refresh anchor when feature changes or on a tick
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

  // ── Label editing ───────────────────────────────────────────────────────────

  function commitLabel() {
    if (labelDraft.trim() && labelDraft !== feature!.label) {
      onRename(feature!.id, labelDraft.trim())
    }
    setEditingLabel(false)
  }

  // ── Apply handlers ──────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

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

      {/* Drag hint */}
      <p className="edit-drag-hint">Drag on the map to move, or enter precise values below.</p>

      {/* Move mode tabs */}
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

      {/* Coord mode */}
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

      {/* Bearing + Distance mode */}
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

      {/* Delta mode */}
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

      {/* Current position readout */}
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
