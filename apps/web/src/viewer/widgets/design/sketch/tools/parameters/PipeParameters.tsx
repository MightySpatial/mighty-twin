/** Pipe tool — bank Rows/Cols + Size/Wall/Gap (mm) + stack mode +
 *  depth reference. v1's PipeParameters.vue, ~270 lines collapsed onto
 *  the v2 primitives. The full canonical pipe schema lives in
 *  pipes3DConfig.ts (Phase 3 follow-up); this component sets only the
 *  geometry-affecting subset — Material / AssetType / etc. live in the
 *  AttributesEditor (rendered by SECTION 3 when usesPipeAttributes). */
import NumberRow from '../../../primitives/NumberRow'
import SelectRow from '../../../primitives/SelectRow'
import SectionLabel from '../../../primitives/SectionLabel'
import { useDraftParams, num, str } from './_helpers'

type DepthRef = 'outsideTop' | 'obvert' | 'centerline' | 'invert' | 'outsideBottom'
type StackMode = 'top' | 'center' | 'down'

const DEPTH_REF_OPTIONS = [
  { value: 'outsideTop' as const,    label: 'Outside top' },
  { value: 'obvert' as const,        label: 'Obvert' },
  { value: 'centerline' as const,    label: 'Centreline' },
  { value: 'invert' as const,        label: 'Invert' },
  { value: 'outsideBottom' as const, label: 'Outside bottom' },
]

const STACK_OPTIONS = [
  { value: 'top' as const,    label: 'Stack ↑' },
  { value: 'center' as const, label: 'Centred' },
  { value: 'down' as const,   label: 'Stack ↓' },
]

export default function PipeParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  const depthRef = str(params, 'depthReference', 'outsideTop') as DepthRef
  const stackMode = str(params, 'pipeStackMode', 'top') as StackMode
  return (
    <>
      <SectionLabel>Bank</SectionLabel>
      <div className="dw-row dw-row--inline" style={{ display: 'flex', gap: 8 }}>
        <NumberRow label="Rows" value={num(params, 'pipeRows', 1)} min={1} max={8} step={1} onChange={v => setParam({ pipeRows: typeof v === 'number' ? Math.round(Math.max(1, v)) : 1 })} />
        <NumberRow label="Cols" value={num(params, 'pipeCols', 1)} min={1} max={8} step={1} onChange={v => setParam({ pipeCols: typeof v === 'number' ? Math.round(Math.max(1, v)) : 1 })} />
      </div>

      <SectionLabel>Geometry (mm)</SectionLabel>
      <div className="dw-row dw-row--inline" style={{ display: 'flex', gap: 8 }}>
        <NumberRow label="Size" value={num(params, 'pipeSizeMm', 100)} step={1} unit="mm" onChange={v => setParam({ pipeSizeMm: typeof v === 'number' ? v : 100 })} />
        <NumberRow label="Wall" value={num(params, 'pipeWallMm', 5)}   step={1} unit="mm" onChange={v => setParam({ pipeWallMm: typeof v === 'number' ? v : 5 })} />
        <NumberRow label="Gap"  value={num(params, 'pipeGapMm', 0)}    step={1} unit="mm" onChange={v => setParam({ pipeGapMm: typeof v === 'number' ? v : 0 })} />
      </div>

      <SelectRow<StackMode>
        label="Stack mode"
        value={stackMode}
        options={STACK_OPTIONS}
        onChange={v => setParam({ pipeStackMode: v })}
      />
      <SelectRow<DepthRef>
        label="Depth reference"
        value={depthRef}
        options={DEPTH_REF_OPTIONS}
        onChange={v => setParam({ depthReference: v })}
      />
    </>
  )
}
