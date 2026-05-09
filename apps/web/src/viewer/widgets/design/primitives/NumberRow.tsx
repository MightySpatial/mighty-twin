/** Label + number input + optional unit suffix row. Used in v1 doe-field
 *  and in the move-mode tabs. */
import SectionLabel from './SectionLabel'

interface Props {
  label: string
  value: number | string
  step?: number
  min?: number
  max?: number
  unit?: string
  placeholder?: string
  onChange: (v: number | string) => void
  /** When true, parse the input as a finite number; otherwise pass the raw string. */
  numeric?: boolean
}

export default function NumberRow({
  label, value, step = 1, min, max, unit, placeholder, onChange, numeric = true,
}: Props) {
  return (
    <div className="dw-row dw-row--number">
      <SectionLabel>{label}</SectionLabel>
      <div className="dw-number-group">
        <input
          type="number"
          className="dw-number-input"
          value={value}
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          onChange={e => {
            if (!numeric) { onChange(e.target.value); return }
            const v = Number(e.target.value)
            if (Number.isFinite(v)) onChange(v)
            else onChange(e.target.value)
          }}
          aria-label={label}
        />
        {unit && <span className="dw-number-unit">{unit}</span>}
      </div>
    </div>
  )
}
