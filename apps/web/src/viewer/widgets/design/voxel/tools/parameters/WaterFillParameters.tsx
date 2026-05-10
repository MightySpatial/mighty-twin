/** Water Fill — set fill elevation either via direct altitude entry or
 *  by clicking a point on the globe to reuse its altitude. */
import NumberRow from '../../../primitives/NumberRow'
import { useToolParams, num, bool } from '../useVoxelToolParams'
import { HintBanner, ApplyButton } from './_shared'
import type { VoxelToolParametersProps } from '../voxelRegistry'

export default function WaterFillParameters({ hint }: VoxelToolParametersProps) {
  const { params, setParam } = useToolParams('voxel_water')
  const useCursor = bool(params, 'useCursor', false)
  const fillElevAlt = num(params, 'fillElevAlt', 0)

  function apply() {
    window.dispatchEvent(new CustomEvent('voxel:apply', { detail: { tool: 'voxel_water' } }))
  }

  return (
    <>
      {hint && <HintBanner>{hint}</HintBanner>}
      <label className="vx-checkbox-row">
        <input
          type="checkbox"
          checked={useCursor}
          onChange={e => setParam('useCursor', e.target.checked)}
        />
        <span>Use cursor elevation (next click)</span>
      </label>
      {!useCursor && (
        <NumberRow
          label="Fill elevation"
          value={fillElevAlt}
          step={0.1}
          unit="m"
          onChange={v => setParam('fillElevAlt', typeof v === 'number' ? v : 0)}
        />
      )}
      <ApplyButton label="Flood fill" onClick={apply} disabled={useCursor} />
    </>
  )
}
