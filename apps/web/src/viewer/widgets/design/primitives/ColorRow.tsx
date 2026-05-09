/** Label + colour swatch + hex input row. Mirrors v1's color-swatch-wrap
 *  pattern (used for stroke / fill / outline pickers). */
import SectionLabel from './SectionLabel'
import HexInput from './HexInput'

interface Props {
  label: string
  value: string
  onChange: (hex: string) => void
}

export default function ColorRow({ label, value, onChange }: Props) {
  return (
    <div className="dw-row dw-row--color">
      <SectionLabel>{label}</SectionLabel>
      <div className="dw-color-group">
        <input
          type="color"
          className="dw-color-swatch"
          value={value}
          onChange={e => onChange(e.target.value)}
          aria-label={label}
        />
        <HexInput value={value} onChange={onChange} />
      </div>
    </div>
  )
}
