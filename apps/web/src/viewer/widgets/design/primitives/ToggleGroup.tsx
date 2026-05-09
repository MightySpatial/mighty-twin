/** N-way pill toggle. Used by v1's etog-btn (By Layer / By Type), the
 *  Square/Round shape picker, and the Coordinate / Bearing & Dist / ΔE/ΔN
 *  move-mode tabs. */

interface Option<T extends string> { value: T; label: string }

interface Props<T extends string> {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  /** "pill" matches the v1 etog-btn appearance; "tile" matches doe-toggle-row. */
  variant?: 'pill' | 'tile'
  ariaLabel?: string
}

export default function ToggleGroup<T extends string>({
  value, options, onChange, variant = 'pill', ariaLabel,
}: Props<T>) {
  const cls = variant === 'pill' ? 'dw-toggle dw-toggle--pill' : 'dw-toggle dw-toggle--tile'
  return (
    <div className={cls} role="radiogroup" aria-label={ariaLabel}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={`dw-toggle-btn${value === o.value ? ' on' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
