/** Pyramid — base width/depth, height, per-face wall angle (degrees from
 *  vertical) for N/S/E/W. An "apply to all" toggle locks the four faces
 *  together. A small live preview shows the stepped block count per
 *  level under the current params. */
import NumberRow from '../../../primitives/NumberRow'
import { useToolParams, num, bool } from '../useVoxelToolParams'
import { MaterialPickerRow, HintBanner, ApplyButton } from './_shared'
import type { VoxelToolParametersProps } from '../voxelRegistry'

export default function PyramidParameters({ hint }: VoxelToolParametersProps) {
  const { params, setParam, setParams } = useToolParams('voxel_pyramid')
  const baseW  = num(params, 'baseW', 8)
  const baseD  = num(params, 'baseD', 8)
  const height = num(params, 'height', 6)
  const angleN = num(params, 'angleN', 45)
  const angleS = num(params, 'angleS', 45)
  const angleE = num(params, 'angleE', 45)
  const angleW = num(params, 'angleW', 45)
  const linkAll = bool(params, 'linkAll', true)

  function setAll(v: number) {
    setParams({ angleN: v, angleS: v, angleE: v, angleW: v })
  }

  // Stepped block count by level — for each course, base shrinks by
  // 2 * tan(angle) blocks per face. We compute a coarse N-side estimate
  // (avg of N/S) × E-side estimate.
  const preview: { course: number; count: number }[] = []
  let curW = baseW
  let curD = baseD
  for (let h = 0; h < height; h++) {
    const w = Math.max(1, Math.round(curW))
    const d = Math.max(1, Math.round(curD))
    preview.push({ course: h, count: w * d })
    const shrinkW = Math.tan(((angleE + angleW) / 2) * Math.PI / 180) * 2
    const shrinkD = Math.tan(((angleN + angleS) / 2) * Math.PI / 180) * 2
    curW = Math.max(1, curW - shrinkW)
    curD = Math.max(1, curD - shrinkD)
  }
  const totalBlocks = preview.reduce((s, c) => s + c.count, 0)

  function apply() {
    window.dispatchEvent(new CustomEvent('voxel:apply', { detail: { tool: 'voxel_pyramid' } }))
  }

  return (
    <>
      {hint && <HintBanner>{hint}</HintBanner>}
      <NumberRow label="Base W" value={baseW}  step={1} min={1} unit="blocks" onChange={v => setParam('baseW',  typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <NumberRow label="Base D" value={baseD}  step={1} min={1} unit="blocks" onChange={v => setParam('baseD',  typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <NumberRow label="Height" value={height} step={1} min={1} unit="blocks" onChange={v => setParam('height', typeof v === 'number' ? Math.max(1, Math.round(v)) : 1)} />
      <label className="vx-checkbox-row">
        <input
          type="checkbox"
          checked={linkAll}
          onChange={e => setParam('linkAll', e.target.checked)}
        />
        <span>Apply same angle to all faces</span>
      </label>
      {linkAll ? (
        <NumberRow label="Wall angle" value={angleN} step={1} min={0} max={89} unit="°" onChange={v => setAll(typeof v === 'number' ? v : 45)} />
      ) : (
        <>
          <NumberRow label="N face" value={angleN} step={1} min={0} max={89} unit="°" onChange={v => setParam('angleN', typeof v === 'number' ? v : 45)} />
          <NumberRow label="S face" value={angleS} step={1} min={0} max={89} unit="°" onChange={v => setParam('angleS', typeof v === 'number' ? v : 45)} />
          <NumberRow label="E face" value={angleE} step={1} min={0} max={89} unit="°" onChange={v => setParam('angleE', typeof v === 'number' ? v : 45)} />
          <NumberRow label="W face" value={angleW} step={1} min={0} max={89} unit="°" onChange={v => setParam('angleW', typeof v === 'number' ? v : 45)} />
        </>
      )}
      <MaterialPickerRow />
      <div className="vx-preview">
        <div className="dw-section-label">Stepped courses</div>
        <ul className="vx-preview-rows">
          {preview.slice(0, 6).map(p => (
            <li key={p.course}>course {p.course}: <b>{p.count.toLocaleString()}</b> blocks</li>
          ))}
          {preview.length > 6 && <li className="vx-preview-more">…{preview.length - 6} more</li>}
        </ul>
        <div className="vx-preview-total">Total ≈ <b>{totalBlocks.toLocaleString()}</b> blocks</div>
      </div>
      <ApplyButton label="Stamp pyramid" onClick={apply} />
    </>
  )
}
