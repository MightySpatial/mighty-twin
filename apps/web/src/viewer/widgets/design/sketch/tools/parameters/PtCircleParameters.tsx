/** Pt circle — flat circle anchored at the click. Radius + segments. */
import NumberRow from '../../../primitives/NumberRow'
import { useDraftParams, num } from './_helpers'

export default function PtCircleParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  return (
    <>
      <NumberRow label="Radius"   value={num(params, 'radius', 1)}    step={0.1} unit="m" onChange={v => setParam({ radius: typeof v === 'number' ? v : 1 })} />
      <NumberRow label="Segments" value={num(params, 'segments', 32)} min={8} max={128} step={1} onChange={v => setParam({ segments: typeof v === 'number' ? Math.round(v) : 32 })} />
    </>
  )
}
