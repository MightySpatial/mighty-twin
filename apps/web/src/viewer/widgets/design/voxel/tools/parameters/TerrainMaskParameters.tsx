/** Terrain Mask — redirect card.
 *
 *  Terrain masking has moved out of the design widget's voxel toolbox
 *  and into the Terrain widget's Mask tab so it sits next to the rest
 *  of the masking / clipping / underground tools. This component
 *  intentionally stays in place (it's still referenced by the voxel
 *  tool registry) but now renders a redirect card instead of the old
 *  parameters form.
 */
import { Mountain, ArrowRight } from 'lucide-react'
import { HintBanner } from './_shared'
import type { VoxelToolParametersProps } from '../voxelRegistry'

export default function TerrainMaskParameters({ hint }: VoxelToolParametersProps) {
  return (
    <>
      {hint && <HintBanner>{hint}</HintBanner>}
      <div
        style={{
          padding: 14,
          background: 'rgba(45, 212, 191, 0.08)',
          border: '1px solid rgba(45, 212, 191, 0.3)',
          borderRadius: 8,
          color: '#e6edf3',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#2dd4bf', fontWeight: 600 }}>
          <Mountain size={14} />
          Terrain masking has moved
        </div>
        <p style={{ margin: 0, color: 'rgba(230,237,243,0.75)' }}>
          The terrain mask workflow now lives in the <strong>Terrain</strong>{' '}
          widget. Open the Terrain widget and switch to the{' '}
          <strong>Mask</strong> tab — you can draw a polygon mask, blend
          it with the globe, or use a design voxel layer as the mask
          shape.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(230,237,243,0.55)' }}>
          <span>Sidebar</span>
          <ArrowRight size={12} />
          <span>Terrain</span>
          <ArrowRight size={12} />
          <span>Mask</span>
        </div>
      </div>
    </>
  )
}
