/**
 * PropertiesTab — selected node detail.
 *
 *   • Header: rename + delete
 *   • Move controls (lon/lat/alt + bearing+distance) — anchor is
 *     positions[0]; line/polygon nodes shift every vertex by the same
 *     delta so the shape translates rather than warps.
 *   • Scale controls — uniform factor that scales W/D/H/radius
 *     proportionally, plus per-axis W/D/H overrides for solids.
 *   • DesignObjectEditor for solids (box / pit / cylinder)
 *   • AttributesEditor for any node (template + freeform)
 *   • Style block (colour / opacity / line / point) — uses the
 *     existing primitives adapted to the engine.
 */
import { useMemo, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import SectionLabel from '../../primitives/SectionLabel'
import ColorRow from '../../primitives/ColorRow'
import SliderRow from '../../primitives/SliderRow'
import NumberRow from '../../primitives/NumberRow'
import SelectRow from '../../primitives/SelectRow'
import AttributesEditor from '../../primitives/AttributesEditor'
import { num } from '../../sketch/tools/parameters/_helpers'
import type { Position } from '../../sketch/types'

type MoveMode = 'latlon' | 'bearing'

export default function PropertiesTab() {
  const selectedNodeId = useCadEngine(s => s.selectedNodeId)
  const node = useCadEngine(s => (selectedNodeId ? s.nodes[selectedNodeId] : null))
  const updateNodeAttributes = useCadEngine(s => s.updateNodeAttributes)
  const updateNodeStyle = useCadEngine(s => s.updateNodeStyle)
  const updateNodeParam = useCadEngine(s => s.updateNodeParam)
  const updateNodePositions = useCadEngine(s => s.updateNodePositions)
  const removeNode = useCadEngine(s => s.removeNode)
  const selectNode = useCadEngine(s => s.selectNode)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [moveMode, setMoveMode] = useState<MoveMode>('latlon')
  const [bearing, setBearing] = useState<string>('0')
  const [distance, setDistance] = useState<string>('0')
  const [altDelta, setAltDelta] = useState<string>('0')

  // Anchor (lon/lat/alt) is positions[0] for every geometry kind.
  const anchor = useMemo<Position | null>(() => {
    if (!node) return null
    const positions = node.params.positions ?? []
    return positions[0] ?? null
  }, [node])

  if (!node) {
    return (
      <div className="properties-tab__empty">
        <p>Select a feature on the map or in Features tab.</p>
      </div>
    )
  }

  const isSolid = ['box', 'pit', 'cylinder'].includes(node.type)
  const isPoint = node.params.geometry === 'point'
  const isLine = node.params.geometry === 'line'
  const isPolygon = node.params.geometry === 'polygon' || isSolid

  const label = (node.attributes.name as string | undefined)
    || (node.attributes.label as string | undefined)
    || node.id

  const lon = anchor?.[0] ?? 0
  const lat = anchor?.[1] ?? 0
  const alt = anchor?.[2] ?? 0

  function shiftAll(dLon: number, dLat: number, dAlt: number) {
    if (!node) return
    const positions = node.params.positions ?? []
    if (positions.length === 0) return
    const next: Position[] = positions.map(p => {
      const z = p[2] ?? 0
      return [p[0] + dLon, p[1] + dLat, z + dAlt]
    })
    updateNodePositions(node.id, next)
  }

  function setLatLon(nextLon: number, nextLat: number, nextAlt: number) {
    if (!anchor) return
    shiftAll(nextLon - lon, nextLat - lat, nextAlt - alt)
  }

  function applyBearingDistance() {
    if (!anchor) return
    const b = Number(bearing)
    const d = Number(distance)
    const z = Number(altDelta)
    if (!Number.isFinite(b) || !Number.isFinite(d)) return
    const [nLon, nLat] = offsetByBearing(lon, lat, b, d)
    shiftAll(nLon - lon, nLat - lat, Number.isFinite(z) ? z : 0)
    setBearing('0')
    setDistance('0')
    setAltDelta('0')
  }

  function applyUniformScale(factor: number) {
    if (!node) return
    if (!Number.isFinite(factor) || factor <= 0) return
    const patch: Record<string, number> = {}
    if (typeof node.params.width === 'number')  patch.width  = node.params.width  * factor
    if (typeof node.params.depth === 'number')  patch.depth  = node.params.depth  * factor
    if (typeof node.params.height === 'number') patch.height = node.params.height * factor
    if (typeof node.params.radius === 'number') patch.radius = node.params.radius * factor
    if (Object.keys(patch).length === 0) return
    updateNodeParam(node.id, patch)
  }

  return (
    <div className="properties-tab edit-panel">
      <div className="edit-feature-header">
        <input
          className="edit-label-input"
          value={label}
          onChange={e => updateNodeAttributes(node.id, { name: e.target.value })}
        />
        <span className="geometry-badge" data-geom={node.params.geometry}>{node.type}</span>
        {!confirmDelete ? (
          <button className="edit-delete-btn" title="Delete" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={13} />
          </button>
        ) : (
          <span className="edit-delete-confirm">
            <button className="edit-delete-yes" onClick={() => { removeNode(node.id); setConfirmDelete(false); selectNode(null) }}>Delete</button>
            <button className="edit-delete-no" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </span>
        )}
      </div>

      {/* ── Move ─────────────────────────────────────────────────── */}
      {anchor && (
        <>
          <SectionLabel>Move</SectionLabel>
          <div className="move-mode-tabs">
            <button
              type="button"
              className={`move-mode-tab${moveMode === 'latlon' ? ' active' : ''}`}
              onClick={() => setMoveMode('latlon')}
            >
              Lat / Lon
            </button>
            <button
              type="button"
              className={`move-mode-tab${moveMode === 'bearing' ? ' active' : ''}`}
              onClick={() => setMoveMode('bearing')}
            >
              Bearing + Distance
            </button>
          </div>

          {moveMode === 'latlon' ? (
            <div className="move-inputs">
              <div className="move-input-group">
                <label htmlFor="anchor-lon">Longitude</label>
                <input
                  id="anchor-lon"
                  type="number"
                  step={0.000001}
                  value={Number.isFinite(lon) ? lon.toFixed(6) : ''}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setLatLon(v, lat, alt)
                  }}
                />
                <span className="move-unit">°</span>
              </div>
              <div className="move-input-group">
                <label htmlFor="anchor-lat">Latitude</label>
                <input
                  id="anchor-lat"
                  type="number"
                  step={0.000001}
                  value={Number.isFinite(lat) ? lat.toFixed(6) : ''}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setLatLon(lon, v, alt)
                  }}
                />
                <span className="move-unit">°</span>
              </div>
              <div className="move-input-group">
                <label htmlFor="anchor-alt">Altitude</label>
                <input
                  id="anchor-alt"
                  type="number"
                  step={0.1}
                  value={Number.isFinite(alt) ? alt.toFixed(2) : ''}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setLatLon(lon, lat, v)
                  }}
                />
                <span className="move-unit">m</span>
              </div>
            </div>
          ) : (
            <div className="move-inputs">
              <div className="move-input-group">
                <label htmlFor="move-bearing">Bearing</label>
                <input
                  id="move-bearing"
                  type="number"
                  step={1}
                  value={bearing}
                  onChange={e => setBearing(e.target.value)}
                />
                <span className="move-unit">°</span>
              </div>
              <div className="move-input-group">
                <label htmlFor="move-distance">Distance</label>
                <input
                  id="move-distance"
                  type="number"
                  step={0.1}
                  value={distance}
                  onChange={e => setDistance(e.target.value)}
                />
                <span className="move-unit">m</span>
              </div>
              <div className="move-input-group">
                <label htmlFor="move-alt-delta">Δ Altitude</label>
                <input
                  id="move-alt-delta"
                  type="number"
                  step={0.1}
                  value={altDelta}
                  onChange={e => setAltDelta(e.target.value)}
                />
                <span className="move-unit">m</span>
              </div>
              <button type="button" className="move-apply-btn" onClick={applyBearingDistance}>
                Apply
              </button>
            </div>
          )}

          <div className="current-position">
            <span className="cur-pos-label">Current anchor</span>
            <span className="cur-pos-value">{lon.toFixed(6)}°, {lat.toFixed(6)}°</span>
            <span className="cur-pos-alt">{alt.toFixed(2)} m</span>
          </div>
        </>
      )}

      {/* ── Scale ────────────────────────────────────────────────── */}
      {(isSolid || typeof node.params.radius === 'number') && (
        <>
          <SectionLabel>Scale</SectionLabel>
          <div className="doe">
            <div className="doe-group">
              <div className="doe-group-label">Uniform</div>
              <UniformScaleRow onApply={applyUniformScale} />
            </div>
            {isSolid && (
              <div className="doe-group">
                <div className="doe-group-label">Per axis</div>
                <div className="doe-grid doe-grid--2">
                  {(node.type === 'box' || node.type === 'pit') && (
                    <>
                      <NumberRow label="W" value={num(node.params, 'width', 1)}  step={0.1} unit="m" onChange={v => updateNodeParam(node.id, { width: typeof v === 'number' ? v : 1 })} />
                      <NumberRow label="D" value={num(node.params, 'depth', 1)}  step={0.1} unit="m" onChange={v => updateNodeParam(node.id, { depth: typeof v === 'number' ? v : 1 })} />
                    </>
                  )}
                  {node.type === 'cylinder' && (
                    <NumberRow label="R" value={num(node.params, 'radius', 1)}  step={0.1} unit="m" onChange={v => updateNodeParam(node.id, { radius: typeof v === 'number' ? v : 1 })} />
                  )}
                  <NumberRow label="H" value={num(node.params, 'height', 1)} step={0.1} unit="m" onChange={v => updateNodeParam(node.id, { height: typeof v === 'number' ? v : 1 })} />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Solids: orientation + dimensions kept for backwards compat ── */}
      {isSolid && (
        <div className="doe">
          <div className="doe-group">
            <div className="doe-group-label">Orientation</div>
            <div className="doe-grid">
              <NumberRow label="Hdg" value={num(node.params, 'heading', 0)} step={1} unit="°" onChange={v => updateNodeParam(node.id, { heading: typeof v === 'number' ? v : 0 })} />
              <NumberRow label="Pitch" value={num(node.params, 'pitch', 0)} step={1} unit="°" onChange={v => updateNodeParam(node.id, { pitch: typeof v === 'number' ? v : 0 })} />
              <NumberRow label="Roll"  value={num(node.params, 'roll', 0)}  step={1} unit="°" onChange={v => updateNodeParam(node.id, { roll: typeof v === 'number' ? v : 0 })} />
            </div>
          </div>
        </div>
      )}

      {/* ── Attributes ───────────────────────────────────────────── */}
      <SectionLabel>Attributes</SectionLabel>
      <AttributesEditor node={node} />

      {/* ── Style ────────────────────────────────────────────────── */}
      <SectionLabel>Style</SectionLabel>
      <ColorRow
        label="Colour"
        value={node.style.color || node.style.fillColor || '#22d3ee'}
        onChange={hex => updateNodeStyle(node.id, { color: hex, fillColor: hex })}
      />
      <SliderRow
        label="Opacity"
        value={Math.round((node.style.opacity ?? 0.7) * 100)}
        min={0} max={100}
        format={v => `${v}%`}
        onChange={v => updateNodeStyle(node.id, { opacity: v / 100 })}
      />
      {isLine && (
        <SliderRow
          label="Line width"
          value={node.style.lineWidth ?? 3}
          min={1} max={10}
          format={v => `${v}px`}
          onChange={v => updateNodeStyle(node.id, { lineWidth: v })}
        />
      )}
      {isPoint && (
        <SliderRow
          label="Point size"
          value={node.style.pointSize ?? 12}
          min={4} max={32}
          format={v => `${v}px`}
          onChange={v => updateNodeStyle(node.id, { pointSize: v })}
        />
      )}
      {(isLine || isPolygon) && (
        <SelectRow
          label="Line dash"
          value={node.style.lineDash ?? 'solid'}
          options={[
            { value: 'solid' as const,   label: 'Solid' },
            { value: 'dash' as const,    label: 'Dash' },
            { value: 'dot' as const,     label: 'Dot' },
            { value: 'dashdot' as const, label: 'Dash-dot' },
          ]}
          onChange={v => updateNodeStyle(node.id, { lineDash: v })}
        />
      )}
    </div>
  )
}

function UniformScaleRow({ onApply }: { onApply: (factor: number) => void }) {
  const [factor, setFactor] = useState<string>('1')
  return (
    <div className="move-input-group">
      <label htmlFor="scale-factor">Factor</label>
      <input
        id="scale-factor"
        type="number"
        step={0.1}
        min={0.01}
        value={factor}
        onChange={e => setFactor(e.target.value)}
      />
      <button
        type="button"
        className="ae-add-btn"
        onClick={() => onApply(Number(factor))}
        disabled={!Number.isFinite(Number(factor)) || Number(factor) <= 0}
      >
        Apply
      </button>
    </div>
  )
}

/** Spherical-earth bearing/distance projection. Bearing in degrees from
 *  north (clockwise), distance in metres. Sufficient for the modest
 *  ranges the design widget deals with — the v1 widget uses the same
 *  Haversine forward formula. */
function offsetByBearing(
  lonDeg: number,
  latDeg: number,
  bearingDeg: number,
  distanceM: number,
): [number, number] {
  const R = 6371000 // mean Earth radius (m)
  const ang = distanceM / R
  const br = (bearingDeg * Math.PI) / 180
  const lat1 = (latDeg * Math.PI) / 180
  const lon1 = (lonDeg * Math.PI) / 180
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(br),
  )
  const lon2 = lon1 + Math.atan2(
    Math.sin(br) * Math.sin(ang) * Math.cos(lat1),
    Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
  )
  return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]
}
