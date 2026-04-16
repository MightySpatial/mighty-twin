/**
 * MightyTwin — Traverse Panel
 * UI for the traverse tool: start coordinates, leg list (bearing + distance),
 * live preview, commit and clear buttons.
 */
import { useState } from 'react'
import type { TraverseDraft, TraverseLeg } from '../types'

interface TraversePanelProps {
  draft: TraverseDraft | null
  onDraftChange: (draft: TraverseDraft | null) => void
  onCommit: () => void
  onClear: () => void
}

export default function TraversePanel({ draft, onDraftChange, onCommit, onClear }: TraversePanelProps) {
  const [bearing, setBearing] = useState(0)
  const [distance, setDistance] = useState(10)
  const [unit, setUnit] = useState<'m' | 'ft'>('m')

  if (!draft) {
    return <p className="draw-hint">Click on the globe to set the start point, or enter coordinates below.</p>
  }

  const setStart = (patch: Partial<Pick<TraverseDraft, 'startLon' | 'startLat'>>) => {
    onDraftChange({ ...draft, ...patch })
  }

  const addLeg = () => {
    const leg: TraverseLeg = { bearing, distance, unit }
    onDraftChange({ ...draft, legs: [...draft.legs, leg] })
  }

  const removeLeg = (index: number) => {
    onDraftChange({ ...draft, legs: draft.legs.filter((_, i) => i !== index) })
  }

  const updateLeg = (index: number, patch: Partial<TraverseLeg>) => {
    onDraftChange({
      ...draft,
      legs: draft.legs.map((l, i) => (i === index ? { ...l, ...patch } : l)),
    })
  }

  return (
    <div className="draw-elevation-section">
      <div className="draw-section-label">Start Point</div>
      <div className="draw-offset-row">
        <label className="draw-section-label">Lat</label>
        <input
          className="draw-offset-input"
          type="number"
          step="0.000001"
          value={draft.startLat}
          onChange={e => setStart({ startLat: parseFloat(e.target.value) || 0 })}
        />
      </div>
      <div className="draw-offset-row">
        <label className="draw-section-label">Lon</label>
        <input
          className="draw-offset-input"
          type="number"
          step="0.000001"
          value={draft.startLon}
          onChange={e => setStart({ startLon: parseFloat(e.target.value) || 0 })}
        />
      </div>

      {/* Existing legs */}
      {draft.legs.length > 0 && (
        <>
          <div className="draw-section-label" style={{ marginTop: 8 }}>Legs</div>
          {draft.legs.map((leg, i) => (
            <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, opacity: 0.6, minWidth: 18 }}>{i + 1}.</span>
              <input
                className="draw-offset-input"
                type="number"
                step="0.1"
                value={leg.bearing}
                title="Bearing (°)"
                style={{ width: 60 }}
                onChange={e => updateLeg(i, { bearing: parseFloat(e.target.value) || 0 })}
              />
              <span style={{ fontSize: 11, opacity: 0.6 }}>°</span>
              <input
                className="draw-offset-input"
                type="number"
                step="0.1"
                value={leg.distance}
                title="Distance"
                style={{ width: 60 }}
                onChange={e => updateLeg(i, { distance: parseFloat(e.target.value) || 0 })}
              />
              <select
                className="draw-elevation-select"
                value={leg.unit}
                style={{ width: 48, padding: '2px 4px', fontSize: 11 }}
                onChange={e => updateLeg(i, { unit: e.target.value as 'm' | 'ft' })}
              >
                <option value="m">m</option>
                <option value="ft">ft</option>
              </select>
              <button
                className="draw-placing-cancel"
                style={{ fontSize: 12, padding: '0 4px', lineHeight: '18px' }}
                title="Remove leg"
                onClick={() => removeLeg(i)}
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}

      {/* Add leg inputs */}
      <div className="draw-section-label" style={{ marginTop: 8 }}>Add Leg</div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input
          className="draw-offset-input"
          type="number"
          step="0.1"
          value={bearing}
          placeholder="Bearing °"
          title="Bearing (°)"
          style={{ width: 60 }}
          onChange={e => setBearing(parseFloat(e.target.value) || 0)}
        />
        <span style={{ fontSize: 11, opacity: 0.6 }}>°</span>
        <input
          className="draw-offset-input"
          type="number"
          step="0.1"
          value={distance}
          placeholder="Distance"
          title="Distance"
          style={{ width: 60 }}
          onChange={e => setDistance(parseFloat(e.target.value) || 0)}
        />
        <select
          className="draw-elevation-select"
          value={unit}
          style={{ width: 48, padding: '2px 4px', fontSize: 11 }}
          onChange={e => setUnit(e.target.value as 'm' | 'ft')}
        >
          <option value="m">m</option>
          <option value="ft">ft</option>
        </select>
      </div>
      <button
        className="draw-tool-btn"
        style={{ marginTop: 6, width: '100%' }}
        onClick={addLeg}
      >
        + Add Leg
      </button>

      {/* Commit / Clear */}
      <div className="draw-tools-grid" style={{ marginTop: 8 }}>
        <button
          className="draw-tool-btn active"
          onClick={onCommit}
          disabled={draft.legs.length === 0}
        >
          Commit
        </button>
        <button className="draw-tool-btn" onClick={onClear}>Clear</button>
      </div>
    </div>
  )
}
