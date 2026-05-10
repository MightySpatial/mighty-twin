/** Pt line — single-click point that emits a short polyline using
 *  bearing + length + inclination. */
import NumberRow from '../../../primitives/NumberRow'
import { useDraftParams, num } from './_helpers'

export default function PtLineParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  return (
    <>
      <NumberRow label="Length"      value={num(params, 'length', 10)}      step={0.1}  unit="m" onChange={v => setParam({ length: typeof v === 'number' ? v : 10 })} />
      <NumberRow label="Bearing"     value={num(params, 'bearing', 0)}      step={1}    unit="°" onChange={v => setParam({ bearing: typeof v === 'number' ? v : 0 })} />
      <NumberRow label="Inclination" value={num(params, 'inclination', 0)}  step={0.5}  unit="°" onChange={v => setParam({ inclination: typeof v === 'number' ? v : 0 })} />
    </>
  )
}
