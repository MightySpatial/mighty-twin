/** Paint / Erase tools — both share the same parameter form. The only
 *  per-tool difference (which type to stamp vs. removing the cell) is
 *  handled by the click handler in the toolbox, not the form. */
import { MaterialPickerRow, HintBanner } from './_shared'
import type { VoxelToolParametersProps } from '../voxelRegistry'

export default function PaintEraseParameters({ hint }: VoxelToolParametersProps) {
  return (
    <>
      {hint && <HintBanner>{hint}</HintBanner>}
      <MaterialPickerRow />
    </>
  )
}
