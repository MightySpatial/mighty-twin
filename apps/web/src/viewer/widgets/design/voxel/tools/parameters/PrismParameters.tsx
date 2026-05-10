/** Prism — draw a polygon footprint on the globe, then set vertical
 *  extent. The polygon comes from the CAD polygon tool (the toolbox
 *  arms it on tool select); this form just configures the height. */
import NumberRow from '../../../primitives/NumberRow'
import { useToolParams, num } from '../useVoxelToolParams'
import { MaterialPickerRow, HintBanner, ApplyButton } from './_shared'
import type { VoxelToolParametersProps } from '../voxelRegistry'

export default function PrismParameters({ hint }: VoxelToolParametersProps) {
  const { params, setParam } = useToolParams('voxel_prism')
  const baseAlt = num(params, 'baseAlt', 0)
  const height  = num(params, 'height', 5)

  function apply() {
    window.dispatchEvent(new CustomEvent('voxel:apply', { detail: { tool: 'voxel_prism' } }))
  }

  return (
    <>
      {hint && <HintBanner>Draw a polygon on the globe to set the footprint, then click Apply.</HintBanner>}
      {hint && <HintBanner>{hint}</HintBanner>}
      <NumberRow label="Base alt"   value={baseAlt} step={0.5} unit="m"      onChange={v => setParam('baseAlt', typeof v === 'number' ? v : 0)} />
      <NumberRow label="Height"     value={height}  step={1} min={1} unit="blocks" onChange={v => setParam('height',  typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <MaterialPickerRow />
      <ApplyButton label="Stamp prism" onClick={apply} />
    </>
  )
}
