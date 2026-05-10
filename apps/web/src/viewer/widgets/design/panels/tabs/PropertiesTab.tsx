/**
 * PropertiesTab — selected node detail.
 *
 *   • Header: rename + delete
 *   • Move: lon/lat/alt OR bearing/distance with current position readout
 *   • Scale: uniform slider + per-axis x/y/z inputs
 *   • Dimensions / Orientation for solids (box / pit / cylinder)
 *   • Style block (colour / opacity / line width / point size / dash)
 *   • Attributes (schema-driven + freeform)
 */
import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import SectionLabel from '../../primitives/SectionLabel'
import ColorRow from '../../primitives/ColorRow'
import SliderRow from '../../primitives/SliderRow'
import NumberRow from '../../primitives/NumberRow'
import SelectRow from '../../primitives/SelectRow'
import ToggleGroup from '../../primitives/ToggleGroup'
import AttributesEditor from '../AttributesEditor'
import { num } from '../../sketch/tools/parameters/_helpers'
import { geodesicOffset, shiftPositions } from '../edit/moveMath'
import type { Position } from '../../sketch/types'

type MoveMode = 'coord' | 'bearing'

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
  const [moveMode, setMoveMode] = useState<MoveMode>('coord')

  // Move-mode draft state — kept local so a stream of keystrokes
  // doesn't fire a position update on each keypress. Apply commits.
  const [coordLon, setCoordLon] = useState('')
  const [coordLat, setCoordLat] = useState('')
  const [coordAlt, setCoordAlt] = useState('')
  const [bearing, setBearing] = useState('0')
  const [distance, setDistance] = useState('1')
  const [altDelta, setAltDelta] = useState('0')

  // Sync coord inputs from the node's anchor whenever selection changes
  // OR the anchor changes outside this tab (drag on map etc.).
  const anchor = node?.params.positions?.[0]
  const anchorLon = anchor?.[0]
  const anchorLat = anchor?.[1]
  const anchorAlt = anchor?.[2] ?? 0
  useEffect(() => {
    if (typeof anchorLon === 'number' && typeof anchorLat === 'number') {
      setCoordLon(anchorLon.toFixed(6))
      setCoordLat(anchorLat.toFixed(6))
      setCoordAlt(anchorAlt.toFixed(2))
    }
    setConfirmDelete(false)
  }, [selectedNodeId, anchorLon, anchorLat, anchorAlt])

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

  // ── Move handlers ────────────────────────────────────────────────────
  function applyCoord() {
    const lon = parseFloat(coordLon)
    const lat = parseFloat(coordLat)
    const alt = parseFloat(coordAlt) || 0
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return
    if (typeof anchorLon !== 'number' || typeof anchorLat !== 'number') return
    const dLon = lon - anchorLon
    const dLat = lat - anchorLat
    const dAlt = alt - anchorAlt
    const positions = node!.params.positions ?? []
    const next = shiftPositions(positions, dLon, dLat, dAlt) as Position[]
    updateNodePositions(node!.id, next)
    // Solid params keep lon/lat/alt mirrored on the params (the Cesium
    // reconciler reads positions[0] for placement, but other tools read
    // the param fields).
    updateNodeParam(node!.id, { lon, lat, alt })
  }

  function applyBearing() {
    const brg = parseFloat(bearing)
    const dist = parseFloat(distance) || 0
    const dAlt = parseFloat(altDelta) || 0
    if (!Number.isFinite(brg) || !Number.isFinite(dist)) return
    if (typeof anchorLon !== 'number' || typeof anchorLat !== 'number') return
    const off = geodesicOffset(anchorLon, anchorLat, brg, dist)
    const dLon = off.lon - anchorLon
    const dLat = off.lat - anchorLat
    const positions = node!.params.positions ?? []
    const next = shiftPositions(positions, dLon, dLat, dAlt) as Position[]
    updateNodePositions(node!.id, next)
    updateNodeParam(node!.id, {
      lon: off.lon,
      lat: off.lat,
      alt: anchorAlt + dAlt,
    })
    // Reset bearing/distance after a successful apply so the user can
    // chain moves without zeroing manually.
    setBearing('0')
    setDistance('0')
    setAltDelta('0')
  }

  // ── Scale handlers ───────────────────────────────────────────────────
  const uniform = num(node.params, 'scale', 1)
  const scaleX = num(node.params, 'scaleX', 1)
  const scaleY = num(node.params, 'scaleY', 1)
  const scaleZ = num(node.params, 'scaleZ', 1)

  function setUniformScale(v: number) {
    updateNodeParam(node!.id, {
      scale: v,
      scaleX: v,
      scaleY: v,
      scaleZ: v,
    })
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

      {/* ── Move ──────────────────────────────────────────────────────── */}
      <SectionLabel>Move</SectionLabel>
      <ToggleGroup<MoveMode>
        value={moveMode}
        onChange={setMoveMode}
        options={[
          { value: 'coord', label: 'Coordinate' },
          { value: 'bearing', label: 'Bearing & dist' },
        ]}
      />

      {moveMode === 'coord' && (
        <div className="prop-move">
          <NumberRow
            label="Latitude"
            value={coordLat}
            step={0.000001}
            unit="°"
            numeric={false}
            onChange={v => setCoordLat(typeof v === 'string' ? v : String(v))}
          />
          <NumberRow
            label="Longitude"
            value={coordLon}
            step={0.000001}
            unit="°"
            numeric={false}
            onChange={v => setCoordLon(typeof v === 'string' ? v : String(v))}
          />
          <NumberRow
            label="Altitude"
            value={coordAlt}
            step={0.01}
            unit="m"
            numeric={false}
            onChange={v => setCoordAlt(typeof v === 'string' ? v : String(v))}
          />
          <button
            type="button"
            className="prop-apply-btn"
            onClick={applyCoord}
            disabled={typeof anchorLon !== 'number'}
          >
            Apply
          </button>
        </div>
      )}

      {moveMode === 'bearing' && (
        <div className="prop-move">
          <NumberRow
            label="Bearing"
            value={bearing}
            min={0}
            max={360}
            step={0.1}
            unit="°"
            numeric={false}
            onChange={v => setBearing(typeof v === 'string' ? v : String(v))}
          />
          <NumberRow
            label="Distance"
            value={distance}
            min={0}
            step={0.01}
            unit="m"
            numeric={false}
            onChange={v => setDistance(typeof v === 'string' ? v : String(v))}
          />
          <NumberRow
            label="ΔAltitude"
            value={altDelta}
            step={0.01}
            unit="m"
            numeric={false}
            onChange={v => setAltDelta(typeof v === 'string' ? v : String(v))}
          />
          <button
            type="button"
            className="prop-apply-btn"
            onClick={applyBearing}
            disabled={typeof anchorLon !== 'number'}
          >
            Apply
          </button>
        </div>
      )}

      {typeof anchorLon === 'number' && typeof anchorLat === 'number' && (
        <div className="prop-pos-readout">
          <span className="prop-pos-readout__label">Current</span>
          <span className="prop-pos-readout__val">
            {anchorLat.toFixed(6)}°, {anchorLon.toFixed(6)}° · {anchorAlt.toFixed(2)} m
          </span>
        </div>
      )}

      {/* ── Scale ─────────────────────────────────────────────────────── */}
      <SectionLabel>Scale</SectionLabel>
      <SliderRow
        label="Uniform"
        value={uniform}
        min={0.1}
        max={10}
        step={0.05}
        format={v => `${v.toFixed(2)}×`}
        onChange={setUniformScale}
      />
      <div className="prop-scale-row">
        <NumberRow
          label="X"
          value={scaleX}
          step={0.05}
          min={0.05}
          onChange={v => updateNodeParam(node.id, { scaleX: typeof v === 'number' ? v : 1 })}
        />
        <NumberRow
          label="Y"
          value={scaleY}
          step={0.05}
          min={0.05}
          onChange={v => updateNodeParam(node.id, { scaleY: typeof v === 'number' ? v : 1 })}
        />
        <NumberRow
          label="Z"
          value={scaleZ}
          step={0.05}
          min={0.05}
          onChange={v => updateNodeParam(node.id, { scaleZ: typeof v === 'number' ? v : 1 })}
        />
      </div>

      {/* ── Solids: dimensions + orientation ─────────────────────────── */}
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

      {/* ── Style ─────────────────────────────────────────────────────── */}
      <SectionLabel>Style</SectionLabel>
      <ColorRow
        label="Colour"
        value={node.style.color || node.style.fillColor || '#2dd4bf'}
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

      {/* ── Attributes ────────────────────────────────────────────────── */}
      <SectionLabel>Attributes</SectionLabel>
      <AttributesEditor nodeId={node.id} />
    </div>
  )
}
