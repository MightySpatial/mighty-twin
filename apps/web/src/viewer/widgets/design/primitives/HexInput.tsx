/** Hex colour text input with debounced commit-on-blur and live-on-valid.
 *  Used by ColorRow + StylePanel; reused anywhere a hex string is editable. */
import { useState, useEffect, useCallback } from 'react'

const HEX_RE = /^#[0-9A-Fa-f]{6}$/

interface Props {
  value: string
  onChange: (hex: string) => void
}

export default function HexInput({ value, onChange }: Props) {
  const [draft, setDraft] = useState(value)
  useEffect(() => { setDraft(value) }, [value])

  const commit = useCallback(() => {
    if (HEX_RE.test(draft)) onChange(draft)
    else setDraft(value)
  }, [draft, value, onChange])

  return (
    <input
      type="text"
      className="dw-hex-input"
      value={draft}
      onChange={e => {
        const v = e.target.value
        setDraft(v)
        if (HEX_RE.test(v)) onChange(v)
      }}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit() }}
    />
  )
}
