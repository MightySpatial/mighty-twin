/** Label + range slider + value-readout row. Mirrors v1's slider-wrap. */
import SectionLabel from './SectionLabel'

interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Human-formatted value to show on the right (e.g. "3px", "70%"). */
  format?: (v: number) => string
  onChange: (v: number) => void
}

export default function SliderRow({ label, value, min, max, step = 1, format, onChange }: Props) {
  const display = format ? format(value) : String(value)
  return (
    <div className="dw-row dw-row--slider">
      <SectionLabel>{label}</SectionLabel>
      <div className="dw-slider-group">
        <input
          type="range"
          className="dw-slider"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          aria-label={label}
        />
        <span className="dw-slider-val">{display}</span>
      </div>
    </div>
  )
}
