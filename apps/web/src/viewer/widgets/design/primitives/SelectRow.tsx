/** Label + native <select>. Mirrors v1's `inp sel` pattern. */
import SectionLabel from './SectionLabel'

export interface SelectOption<T extends string | number = string> {
  value: T
  label: string
  group?: string
}

interface Props<T extends string | number> {
  label: string
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  disabled?: boolean
}

export default function SelectRow<T extends string | number = string>({
  label, value, options, onChange, disabled,
}: Props<T>) {
  // If any option carries a `group`, render <optgroup>s; otherwise flat list.
  const hasGroups = options.some(o => o.group)
  const grouped = hasGroups
    ? options.reduce<Record<string, SelectOption<T>[]>>((acc, opt) => {
        const k = opt.group ?? ''
        if (!acc[k]) acc[k] = []
        acc[k].push(opt)
        return acc
      }, {})
    : null

  return (
    <div className="dw-row dw-row--select">
      <SectionLabel>{label}</SectionLabel>
      <select
        className="dw-select"
        value={value}
        onChange={e => {
          const raw = e.target.value
          // Coerce back to number when option values are numeric. T's runtime
          // type is erased, so we rely on the original option's typeof.
          const match = options.find(o => String(o.value) === raw)
          onChange((match ? match.value : raw) as T)
        }}
        disabled={disabled}
        aria-label={label}
      >
        {grouped
          ? Object.entries(grouped).map(([g, opts]) => (
              g
                ? <optgroup key={g} label={g}>{opts.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}</optgroup>
                : opts.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)
            ))
          : options.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </div>
  )
}
