/**
 * PropertiesTab — selected node detail.
 *
 *   • Header: rename + delete
 *   • Move controls: lon/lat/alt OR bearing+distance from current pos
 *   • Scale controls: uniform slider + per-axis x/y/z (solids only)
 *   • DesignObjectEditor for solids (box / pit / cylinder)
 *   • AttributesEditor — schema-driven attribute rows for the node
 *   • Style block (colour / opacity / line / point)
 */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import SectionLabel from '../../primitives/SectionLabel'
import ColorRow from '../../primitives/ColorRow'
import SliderRow from '../../primitives/SliderRow'
import NumberRow from '../../primitives/NumberRow'
import SelectRow from '../../primitives/SelectRow'
import AttributesEditor from '../AttributesEditor'
import { num } from '../../sketch/tools/parameters/_helpers'
import type { Position } from '../../sketch/types'

export default function PropertiesTab() {
  const selectedNodeId = useCadEngine(s => s.selectedNodeId)
  const node = useCadEngine(s => (selectedNodeId ? s.nodes[selectedNodeId] : null))
  const updateNodeAttributes = useCadEngine(s => s.updateNodeAttributes)
  const updateNodeStyle = useCadEngine(s => s.updateNodeStyle)
  const updateNodeParam = useCadEngine(s => s.updateNodeParam)
  const removeNode = useCadEngine(s => s.removeNode)
  const selectNode = useCadEngine(s => s.selectNode)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const updateNodePositions = useCadEngine(s => s.updateNodePositions)
  const [moveMode, setMoveMode] = useState<'latlon' | 'bearing'>('latlon')
  const [bearingDeg, setBearingDeg] = useState(0)
  const [distanceM, setDistanceM] = useState(10)

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

  const positions: Position[] = node.params.positions ?? []
  const anchor: Position | null = positions.length > 0 ? positions[0] : null
  const lon = anchor ? anchor[0] : 0
  const lat = anchor ? anchor[1] : 0
  const alt = (anchor && anchor.length >= 3 ? (anchor as [number, number, number])[2] : 0) ?? 0

  function setAnchor(nextLon: number, nextLat: number, nextAlt: number): void {
    if (!node) return
    const p0: Position = [nextLon, nextLat, nextAlt]
    if (positions.length <= 1) {
      updateNodePositions(node.id, [p0])
      return
    }
    // For multi-vertex features, translate the whole geometry by the
    // delta between old and new anchor — keeps shape intact.
    const dLon = nextLon - lon
    const dLat = nextLat - lat
    const dAlt = nextAlt - alt
    const next: Position[] = positions.map(p => {
      const a = (p.length >= 3 ? (p as [number, number, number])[2] : 0)
      return [p[0] + dLon, p[1] + dLat, a + dAlt]
    })
    updateNodePositions(node.id, next)
  }

  function applyBearing(): void {
    if (!anchor) return
    // Spherical earth approximation, matches v1's traverse offset.
    const R = 6378137
    const brg = (bearingDeg * Math.PI) / 180
    const dist = distanceM
    const lat1 = (lat * Math.PI) / 180
    const lon1 = (lon * Math.PI) / 180
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(dist / R) +
      Math.cos(lat1) * Math.sin(dist / R) * Math.cos(brg),
    )
    const lon2 = lon1 + Math.atan2(
      Math.sin(brg) * Math.sin(dist / R) * Math.cos(lat1),
      Math.cos(dist / R) - Math.sin(lat1) * Math.sin(lat2),
    )
    setAnchor((lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI, alt)
  }

  function applyScale(factor: number): void {
    if (!node || !Number.isFinite(factor) || factor <= 0) return
    if (isSolid) {
      updateNodeParam(node.id, {
        width: num(node.params, 'width', 1) * factor,
        depth: num(node.params, 'depth', 1) * factor,
        height: num(node.params, 'height', 1) * factor,
        radius: num(node.params, 'radius', 1) * factor,
      })
      return
    }
    if (positions.length <= 1) return
    // Polylines / polygons: scale around the anchor (positions[0]).
    const ax = positions[0][0]
    const ay = positions[0][1]
    const az = positions[0].length >= 3 ? (positions[0] as [number, number, number])[2] : 0
    const next: Position[] = positions.map((p, i) => {
      if (i === 0) return p
      const z = p.length >= 3 ? (p as [number, number, number])[2] : 0
      return [ax + (p[0] - ax) * factor, ay + (p[1] - ay) * factor, az + (z - az) * factor]
    })
    updateNodePositions(node.id, next)
  }

  return (
    <div className="properties-tab">
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

      {anchor && (
        <>
          <SectionLabel>Move</SectionLabel>
          <div className="move-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={moveMode === 'latlon'}
              className={`move-mode-tab${moveMode === 'latlon' ? ' active' : ''}`}
              onClick={() => setMoveMode('latlon')}
            >Lat / Lon</button>
            <button
              type="button"
              role="tab"
              aria-selected={moveMode === 'bearing'}
              className={`move-mode-tab${moveMode === 'bearing' ? ' active' : ''}`}
              onClick={() => setMoveMode('bearing')}
            >Bearing</button>
          </div>

          {moveMode === 'latlon' ? (
            <div className="move-inputs">
              <div className="move-input-group">
                <label htmlFor="prop-lon">Longitude</label>
                <input
                  id="prop-lon"
                  type="number"
                  step={0.000001}
                  value={lon}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setAnchor(v, lat, alt)
                  }}
                />
                <span className="move-unit">°</span>
              </div>
              <div className="move-input-group">
                <label htmlFor="prop-lat">Latitude</label>
                <input
                  id="prop-lat"
                  type="number"
                  step={0.000001}
                  value={lat}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setAnchor(lon, v, alt)
                  }}
                />
                <span className="move-unit">°</span>
              </div>
              <div className="move-input-group">
                <label htmlFor="prop-alt">Altitude</label>
                <input
                  id="prop-alt"
                  type="number"
                  step={0.1}
                  value={alt}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setAnchor(lon, lat, v)
                  }}
                />
                <span className="move-unit">m</span>
              </div>
            </div>
          ) : (
            <div className="move-inputs">
              <div className="move-input-group">
                <label htmlFor="prop-bearing">Bearing</label>
                <input
                  id="prop-bearing"
                  type="number"
                  step={1}
                  value={bearingDeg}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setBearingDeg(v)
                  }}
                />
                <span className="move-unit">°</span>
              </div>
              <div className="move-input-group">
                <label htmlFor="prop-dist">Distance</label>
                <input
                  id="prop-dist"
                  type="number"
                  step={0.1}
                  value={distanceM}
                  onChange={e => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v)) setDistanceM(v)
                  }}
                />
                <span className="move-unit">m</span>
              </div>
              <button type="button" className="move-apply-btn" onClick={applyBearing}>
                Move {distanceM}m at {bearingDeg}°
              </button>
            </div>
          )}
        </>
      )}

      {(isSolid || positions.length > 1) && (
        <>
          <SectionLabel>Scale</SectionLabel>
          <SliderRow
            label="Uniform"
            value={100}
            min={10}
            max={400}
            format={v => `${v}%`}
            onChange={v => applyScale(v / 100)}
          />
          {isSolid && (
            <div className="doe-grid doe-grid--2">
              <NumberRow
                label="Scale W"
                value={1}
                step={0.1}
                onChange={v => {
                  if (typeof v !== 'number') return
                  updateNodeParam(node.id, { width: num(node.params, 'width', 1) * v })
                }}
              />
              <NumberRow
                label="Scale H"
                value={1}
                step={0.1}
                onChange={v => {
                  if (typeof v !== 'number') return
                  updateNodeParam(node.id, { height: num(node.params, 'height', 1) * v })
                }}
              />
            </div>
          )}
        </>
      )}

      {isSolid && (
        <div className="doe">
          <div className="doe-group">
            <div className="doe-group-label">Dimensions</div>
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

      <AttributesEditor nodeId={node.id} />
    </div>
  )
}
