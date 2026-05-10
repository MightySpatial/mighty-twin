/** N-sided regular polygon — sides + radius + rotation. */
import NumberRow from '../../../primitives/NumberRow'
import { useDraftParams, num } from './_helpers'

export default function PolygonNParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  return (
    <>
      <NumberRow label="Sides"    value={num(params, 'sides', 6)}    min={3} max={32} step={1} onChange={v => setParam({ sides: typeof v === 'number' ? Math.round(Math.max(3, Math.min(32, v))) : 6 })} />
      <NumberRow label="Radius"   value={num(params, 'radius', 1)}   step={0.1} unit="m" onChange={v => setParam({ radius: typeof v === 'number' ? v : 1 })} />
      <NumberRow label="Rotation" value={num(params, 'heading', 0)}  step={1}   unit="°" onChange={v => setParam({ heading: typeof v === 'number' ? v : 0 })} />
    </>
  )
}
