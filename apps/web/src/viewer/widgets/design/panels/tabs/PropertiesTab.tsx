/**
 * PropertiesTab — selected node detail.
 *
 *   • Header: rename + delete
 *   • DesignObjectEditor for solids (box / pit / cylinder)
 *   • AttributesEditor for any node (template + freeform)
 *   • Style block (colour / opacity / line / point) — uses the
 *     existing StylePanel adapted to the engine.
 */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import SectionLabel from '../../primitives/SectionLabel'
import ColorRow from '../../primitives/ColorRow'
import SliderRow from '../../primitives/SliderRow'
import NumberRow from '../../primitives/NumberRow'
import SelectRow from '../../primitives/SelectRow'
import { num } from '../../sketch/tools/parameters/_helpers'

export default function PropertiesTab() {
  const selectedNodeId = useCadEngine(s => s.selectedNodeId)
  const node = useCadEngine(s => (selectedNodeId ? s.nodes[selectedNodeId] : null))
  const updateNodeAttributes = useCadEngine(s => s.updateNodeAttributes)
  const updateNodeStyle = useCadEngine(s => s.updateNodeStyle)
  const updateNodeParam = useCadEngine(s => s.updateNodeParam)
  const removeNode = useCadEngine(s => s.removeNode)
  const selectNode = useCadEngine(s => s.selectNode)

  const [confirmDelete, setConfirmDelete] = useState(false)

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
    </div>
  )
}
