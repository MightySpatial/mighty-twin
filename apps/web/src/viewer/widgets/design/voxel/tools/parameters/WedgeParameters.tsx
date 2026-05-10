/** Wedge / Ramp — base width/depth, height, slope angle, slope
 *  direction (compass rose: N/NE/E/SE/S/SW/W/NW). */
import NumberRow from '../../../primitives/NumberRow'
import { useToolParams, num, str } from '../useVoxelToolParams'
import { MaterialPickerRow, HintBanner, ApplyButton } from './_shared'
import type { VoxelToolParametersProps } from '../voxelRegistry'

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
type Compass = typeof COMPASS[number]

export default function WedgeParameters({ hint }: VoxelToolParametersProps) {
  const { params, setParam } = useToolParams('voxel_wedge')
  const baseW  = num(params, 'baseW', 8)
  const baseD  = num(params, 'baseD', 8)
  const height = num(params, 'height', 4)
  const slope  = num(params, 'slope', 30)
  const dir    = str(params, 'direction', 'N') as Compass

  function apply() {
    window.dispatchEvent(new CustomEvent('voxel:apply', { detail: { tool: 'voxel_wedge' } }))
  }

  return (
    <>
      {hint && <HintBanner>{hint}</HintBanner>}
      <NumberRow label="Base W"  value={baseW}  step={1} min={1} unit="blocks" onChange={v => setParam('baseW',  typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <NumberRow label="Base D"  value={baseD}  step={1} min={1} unit="blocks" onChange={v => setParam('baseD',  typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <NumberRow label="Height"  value={height} step={1} min={1} unit="blocks" onChange={v => setParam('height', typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <NumberRow label="Slope"   value={slope}  step={1} min={0} max={89} unit="°" onChange={v => setParam('slope',  typeof v === 'number' ? v : 30)} />

      <div className="dw-row">
        <label className="dw-section-label">Slope direction</label>
        <div className="vx-compass">
          {COMPASS.map(c => (
            <button
              key={c}
              type="button"
              className={`vx-compass-btn${dir === c ? ' is-on' : ''}`}
              onClick={() => setParam('direction', c)}
              title={`Slope rises toward ${c}`}
            >{c}</button>
          ))}
        </div>
      </div>
      <MaterialPickerRow />
      <ApplyButton label="Stamp wedge" onClick={apply} />
    </>
  )
}
