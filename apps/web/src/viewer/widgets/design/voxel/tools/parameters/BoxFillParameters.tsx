/** Box Fill — width/depth/height (in blocks) at the active level, with
 *  an optional "fill to terrain" mode that extends each column down to
 *  the sampled terrain row. The Apply button hands off to the toolbox
 *  via a window event so the heavy lifting (terrain sampling) lives in
 *  the integration layer. */
import NumberRow from '../../../primitives/NumberRow'
import { useToolParams, num, bool } from '../useVoxelToolParams'
import { MaterialPickerRow, HintBanner, ApplyButton } from './_shared'
import type { VoxelToolParametersProps } from '../voxelRegistry'

export default function BoxFillParameters({ hint }: VoxelToolParametersProps) {
  const { params, setParam } = useToolParams('voxel_box')
  const width  = num(params, 'width', 4)
  const depth  = num(params, 'depth', 4)
  const height = num(params, 'height', 4)
  const fillToTerrain = bool(params, 'fillToTerrain', false)

  function apply() {
    window.dispatchEvent(new CustomEvent('voxel:apply', { detail: { tool: 'voxel_box' } }))
  }

  return (
    <>
      {hint && <HintBanner>{hint}</HintBanner>}
      <NumberRow label="Width"  value={width}  step={1} min={1} unit="blocks" onChange={v => setParam('width',  typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <NumberRow label="Depth"  value={depth}  step={1} min={1} unit="blocks" onChange={v => setParam('depth',  typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <NumberRow label="Height" value={height} step={1} min={1} unit="blocks" onChange={v => setParam('height', typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <label className="vx-checkbox-row">
        <input
          type="checkbox"
          checked={fillToTerrain}
          onChange={e => setParam('fillToTerrain', e.target.checked)}
        />
        <span>Fill columns down to terrain</span>
      </label>
      <MaterialPickerRow />
      <ApplyButton label="Stamp box" onClick={apply} />
    </>
  )
}
