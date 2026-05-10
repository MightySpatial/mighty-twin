/** Pt cone — radius + height. */
import NumberRow from '../../../primitives/NumberRow'
import { useDraftParams, num } from './_helpers'

export default function PtConeParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  return (
    <>
      <NumberRow label="Radius" value={num(params, 'radius', 1)} step={0.1} unit="m" onChange={v => setParam({ radius: typeof v === 'number' ? v : 1 })} />
      <NumberRow label="Height" value={num(params, 'height', 2)} step={0.1} unit="m" onChange={v => setParam({ height: typeof v === 'number' ? v : 2 })} />
    </>
  )
}
