/** Pt cylinder — radius + height + heading/pitch/roll + wallThickness. */
import NumberRow from '../../../primitives/NumberRow'
import { useDraftParams, num } from './_helpers'

export default function PtCylinderParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  return (
    <>
      <NumberRow label="Radius"  value={num(params, 'radius', 1)} step={0.1} unit="m" onChange={v => setParam({ radius: typeof v === 'number' ? v : 1 })} />
      <NumberRow label="Height"  value={num(params, 'height', 2)} step={0.1} unit="m" onChange={v => setParam({ height: typeof v === 'number' ? v : 2 })} />
      <NumberRow label="Wall (0=solid)" value={num(params, 'wallThickness', 0)} step={0.05} unit="m" onChange={v => setParam({ wallThickness: typeof v === 'number' ? Math.max(0, v) : 0 })} />
      <NumberRow label="Heading" value={num(params, 'heading', 0)} step={1} unit="°" onChange={v => setParam({ heading: typeof v === 'number' ? v : 0 })} />
      <NumberRow label="Pitch"   value={num(params, 'pitch', 0)}   step={1} unit="°" onChange={v => setParam({ pitch: typeof v === 'number' ? v : 0 })} />
      <NumberRow label="Roll"    value={num(params, 'roll', 0)}    step={1} unit="°" onChange={v => setParam({ roll: typeof v === 'number' ? v : 0 })} />
    </>
  )
}
