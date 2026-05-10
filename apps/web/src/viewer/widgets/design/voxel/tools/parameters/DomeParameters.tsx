/** Dome — ellipsoid radius along W/D/H axes (in blocks). The svoOps
 *  genDome handles the half-vs-full sphere mode; we expose it as a
 *  toggle. */
import NumberRow from '../../../primitives/NumberRow'
import { useToolParams, num, bool } from '../useVoxelToolParams'
import { MaterialPickerRow, HintBanner, ApplyButton } from './_shared'
import type { VoxelToolParametersProps } from '../voxelRegistry'

export default function DomeParameters({ hint }: VoxelToolParametersProps) {
  const { params, setParam } = useToolParams('voxel_dome')
  const rW = num(params, 'rW', 6)
  const rD = num(params, 'rD', 6)
  const rH = num(params, 'rH', 4)
  const halfOnly = bool(params, 'halfOnly', true)

  function apply() {
    window.dispatchEvent(new CustomEvent('voxel:apply', { detail: { tool: 'voxel_dome' } }))
  }

  return (
    <>
      {hint && <HintBanner>{hint}</HintBanner>}
      <NumberRow label="Radius W" value={rW} step={1} min={1} unit="blocks" onChange={v => setParam('rW', typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <NumberRow label="Radius D" value={rD} step={1} min={1} unit="blocks" onChange={v => setParam('rD', typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <NumberRow label="Radius H" value={rH} step={1} min={1} unit="blocks" onChange={v => setParam('rH', typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <label className="vx-checkbox-row">
        <input
          type="checkbox"
          checked={halfOnly}
          onChange={e => setParam('halfOnly', e.target.checked)}
        />
        <span>Upper hemisphere only</span>
      </label>
      <MaterialPickerRow />
      <ApplyButton label="Stamp dome" onClick={apply} />
    </>
  )
}
