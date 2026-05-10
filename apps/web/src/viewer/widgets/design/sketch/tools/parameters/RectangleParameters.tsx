/** Rectangle tool — corner / centre mode + dimensions. */
import SectionLabel from '../../../primitives/SectionLabel'
import ToggleGroup from '../../../primitives/ToggleGroup'
import NumberRow from '../../../primitives/NumberRow'
import { useDraftParams, num, str } from './_helpers'

type Mode = 'corner' | 'center'

export default function RectangleParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  const mode = (str(params, 'mode', 'corner') === 'center' ? 'center' : 'corner') as Mode
  return (
    <>
      <div className="dw-row">
        <SectionLabel>Anchor</SectionLabel>
        <ToggleGroup<Mode>
          value={mode}
          onChange={v => setParam({ mode: v } as Record<string, unknown>)}
          options={[
            { value: 'corner', label: 'Corner-to-corner' },
            { value: 'center', label: 'Centre + size' },
          ]}
        />
      </div>
      <NumberRow label="Width (m)"  value={num(params, 'width', 0)}  step={0.1} unit="m" onChange={v => setParam({ width: typeof v === 'number' ? v : 0 })} />
      <NumberRow label="Depth (m)"  value={num(params, 'depth', 0)}  step={0.1} unit="m" onChange={v => setParam({ depth: typeof v === 'number' ? v : 0 })} />
      <NumberRow label="Heading"    value={num(params, 'heading', 0)} step={1}  unit="°" onChange={v => setParam({ heading: typeof v === 'number' ? v : 0 })} />
    </>
  )
}
