/** Move-mode tab strip + the active mode's input form. Driven by
 *  `useMoveControls` so the parent EditPanel just composes. */
import type { MoveMode } from './useMoveControls'

interface Props {
  mode: MoveMode
  onModeChange: (m: MoveMode) => void
  coord: {
    lon: string; lat: string; alt: string
    setLon: (v: string) => void; setLat: (v: string) => void; setAlt: (v: string) => void
    apply: () => void
  }
  bearing: {
    bearing: string; dist: string; altDelta: string
    setBearing: (v: string) => void; setDist: (v: string) => void; setAltDelta: (v: string) => void
    apply: () => void
  }
  delta: {
    e: string; n: string; alt: string
    setE: (v: string) => void; setN: (v: string) => void; setAlt: (v: string) => void
    apply: () => void
  }
}

export default function MoveModeTabs({ mode, onModeChange, coord, bearing, delta }: Props) {
  return (
    <>
      <div className="move-mode-tabs">
        {(['coord', 'bearing', 'delta'] as MoveMode[]).map(m => (
          <button
            key={m}
            className={`move-mode-tab${mode === m ? ' active' : ''}`}
            onClick={() => onModeChange(m)}
          >
            {m === 'coord' ? 'Coordinate' : m === 'bearing' ? 'Bearing & Dist' : 'ΔE / ΔN'}
          </button>
        ))}
      </div>

      {mode === 'coord' && (
        <div className="move-inputs">
          <Field label="Latitude"  value={coord.lat} onChange={coord.setLat} unit="°"  step="0.000001" placeholder="-33.865" />
          <Field label="Longitude" value={coord.lon} onChange={coord.setLon} unit="°"  step="0.000001" placeholder="151.209" />
          <Field label="Altitude"  value={coord.alt} onChange={coord.setAlt} unit="m"  step="0.01"     placeholder="0.00" />
          <button className="move-apply-btn" onClick={coord.apply}>Apply</button>
        </div>
      )}

      {mode === 'bearing' && (
        <div className="move-inputs">
          <Field label="Bearing"     value={bearing.bearing}  onChange={bearing.setBearing}  unit="°" step="0.1"  min="0" max="360" placeholder="45.0" />
          <Field label="Distance"    value={bearing.dist}     onChange={bearing.setDist}     unit="m" step="0.01" min="0" placeholder="100.00" />
          <Field label="Elevation Δ" value={bearing.altDelta} onChange={bearing.setAltDelta} unit="m" step="0.01" placeholder="0.00" />
          <button className="move-apply-btn" onClick={bearing.apply}>Apply</button>
        </div>
      )}

      {mode === 'delta' && (
        <div className="move-inputs">
          <Field label="ΔEasting"   value={delta.e}   onChange={delta.setE}   unit="m E" step="0.01" placeholder="0.00" />
          <Field label="ΔNorthing"  value={delta.n}   onChange={delta.setN}   unit="m N" step="0.01" placeholder="0.00" />
          <Field label="ΔAltitude"  value={delta.alt} onChange={delta.setAlt} unit="m"   step="0.01" placeholder="0.00" />
          <button className="move-apply-btn" onClick={delta.apply}>Apply</button>
        </div>
      )}
    </>
  )
}

function Field({ label, value, onChange, unit, step, min, max, placeholder }: {
  label: string
  value: string
  onChange: (v: string) => void
  unit: string
  step: string
  min?: string
  max?: string
  placeholder?: string
}) {
  return (
    <div className="move-input-group">
      <label>{label}</label>
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
      />
      <span className="move-unit">{unit}</span>
    </div>
  )
}
