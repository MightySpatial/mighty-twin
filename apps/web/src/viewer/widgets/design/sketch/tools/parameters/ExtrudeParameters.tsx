/** Extrude op — magnitude + bothSides + direction vector. v1 layout. */
import NumberRow from '../../../primitives/NumberRow'
import SectionLabel from '../../../primitives/SectionLabel'
import { useDraftParams, num, bool } from './_helpers'

export default function ExtrudeParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  const bothSides = bool(params, 'bothSides', false)
  return (
    <>
      <NumberRow label="Magnitude" value={num(params, 'magnitude', 5)} step={0.1} min={0.1} unit="m" onChange={v => setParam({ magnitude: typeof v === 'number' ? Math.max(0.1, v) : 5 })} />

      <label className="dw-row" style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={bothSides} onChange={e => setParam({ bothSides: e.target.checked } as Record<string, unknown>)} />
        <span>Both sides (symmetric)</span>
      </label>

      <SectionLabel>Direction vector (°)</SectionLabel>
      <div className="dw-row dw-row--inline" style={{ display: 'flex', gap: 8 }}>
        <NumberRow label="X (E+)" value={num(params, 'dirX', 0)}  step={1} unit="°" onChange={v => setParam({ dirX: typeof v === 'number' ? v : 0 })} />
        <NumberRow label="Y (N+)" value={num(params, 'dirY', 0)}  step={1} unit="°" onChange={v => setParam({ dirY: typeof v === 'number' ? v : 0 })} />
        <NumberRow label="Z (Up)" value={num(params, 'dirZ', 90)} step={1} unit="°" onChange={v => setParam({ dirZ: typeof v === 'number' ? v : 90 })} />
      </div>
    </>
  )
}
