/** Terrain Mask — draws a polygon, samples Cesium terrain inside it,
 *  fills columns from a base level up to terrain. The polygon is drawn
 *  via the borrowed CAD polygon tool; the toolbox installs a listener
 *  that, on polygon close, samples terrain and dispatches the apply
 *  event picked up by the DesignWidget integration layer. */
import NumberRow from '../../../primitives/NumberRow'
import SelectRow from '../../../primitives/SelectRow'
import { useToolParams, num, str } from '../useVoxelToolParams'
import { MaterialPickerRow, HintBanner, ApplyButton } from './_shared'
import type { VoxelToolParametersProps } from '../voxelRegistry'

export default function TerrainMaskParameters({ hint }: VoxelToolParametersProps) {
  const { params, setParam } = useToolParams('voxel_terrain_mask')
  const scope = str(params, 'scope', 'site') as 'site' | 'sketch'
  const depth = num(params, 'depth', 2)

  function apply() {
    window.dispatchEvent(new CustomEvent('voxel:apply', { detail: { tool: 'voxel_terrain_mask' } }))
  }

  return (
    <>
      {hint && <HintBanner>{hint}</HintBanner>}
      <SelectRow
        label="Scope"
        value={scope}
        options={[
          { value: 'site',   label: 'Site (shared across sketches)' },
          { value: 'sketch', label: 'Sketch (this sketch only)' },
        ]}
        onChange={v => setParam('scope', v)}
      />
      <NumberRow
        label="Depth below surface"
        value={depth}
        step={1}
        min={0}
        unit="blocks"
        onChange={v => setParam('depth', typeof v === 'number' ? Math.max(0, Math.round(v)) : 0)}
      />
      <MaterialPickerRow />
      <ApplyButton label="Stamp terrain mask" onClick={apply} />
      <p className="vx-tool-hint">
        Tip: the mask uses the active level. Cesium terrain is sampled
        once per (active-level) grid cell inside the polygon bounding
        box; cells outside the polygon are skipped.
      </p>
    </>
  )
}
