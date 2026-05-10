/** Shared bits for voxel parameter components — material picker chip,
 *  apply button, hint banner. Keeps each per-tool file ~30 lines. */
import type { BlockType } from '../../types'
import { useSvoEngine } from '../../useSvoEngine'

export const BLOCK_TYPE_OPTIONS: { value: BlockType; label: string; colour: string }[] = [
  { value: 'air',         label: 'Air',         colour: 'transparent' },
  { value: 'terrain',     label: 'Terrain',     colour: '#92400e' },
  { value: 'rock',        label: 'Rock',        colour: '#52525b' },
  { value: 'ore',         label: 'Ore',         colour: '#fbbf24' },
  { value: 'overburden',  label: 'Overburden',  colour: '#a8a29e' },
  { value: 'fill',        label: 'Fill',        colour: '#d6d3d1' },
  { value: 'concrete',    label: 'Concrete',    colour: '#9ca3af' },
  { value: 'steel',       label: 'Steel',       colour: '#475569' },
  { value: 'water',       label: 'Water',       colour: '#38bdf8' },
  { value: 'topsoil',     label: 'Topsoil',     colour: '#4d7c0f' },
  { value: 'custom',      label: 'Custom',      colour: '#a855f7' },
]

export function MaterialPickerRow() {
  const active = useSvoEngine(s => s.activeMaterialType)
  const setActive = useSvoEngine(s => s.setActiveMaterialType)
  return (
    <div className="dw-row">
      <label className="dw-section-label">Material</label>
      <select
        className="dw-select"
        value={active}
        onChange={e => setActive(e.target.value as BlockType)}
        aria-label="Active material"
      >
        {BLOCK_TYPE_OPTIONS.filter(o => o.value !== 'air').map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

export function HintBanner({ children }: { children: React.ReactNode }) {
  return <p className="vx-tool-hint">{children}</p>
}

export function ApplyButton({
  label = 'Stamp',
  onClick,
  disabled,
}: { label?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="prop-apply-btn"
      onClick={onClick}
      disabled={disabled}
    >
      {label}
    </button>
  )
}
