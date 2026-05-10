/** Traverse tool — table-driven (no globe clicks). Start point + bearing
 *  / distance rows that build a polyline (or closed polygon).
 *
 *  This is a leaner port of v1's TraverseParameters.vue. The full v1
 *  workflow includes MGA-zone start mode + per-row delete buttons; the
 *  rest of the table experience can land in a follow-up. */
import NumberRow from '../../../primitives/NumberRow'
import SectionLabel from '../../../primitives/SectionLabel'
import { useDraftParams, num, bool } from './_helpers'

interface Leg { bearing: number; distance: number; unit: 'm' | 'ft' }

export default function TraverseParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  const legs = (Array.isArray(params.traverseLegs) ? params.traverseLegs : []) as Leg[]
  const closed = bool(params, 'closed', false)

  function update(i: number, patch: Partial<Leg>) {
    const next = legs.map((l, idx) => idx === i ? { ...l, ...patch } : l)
    setParam({ traverseLegs: next } as Record<string, unknown>)
  }

  function addLeg() {
    setParam({ traverseLegs: [...legs, { bearing: 0, distance: 0, unit: 'm' }] } as Record<string, unknown>)
  }

  function removeLeg(i: number) {
    setParam({ traverseLegs: legs.filter((_, idx) => idx !== i) } as Record<string, unknown>)
  }

  return (
    <>
      <SectionLabel>Start</SectionLabel>
      <div className="dw-row dw-row--inline" style={{ display: 'flex', gap: 8 }}>
        <NumberRow label="Lon" value={num(params, 'startLon', 0)} step={0.000001} onChange={v => setParam({ startLon: typeof v === 'number' ? v : 0 })} />
        <NumberRow label="Lat" value={num(params, 'startLat', 0)} step={0.000001} onChange={v => setParam({ startLat: typeof v === 'number' ? v : 0 })} />
      </div>

      <SectionLabel>Legs</SectionLabel>
      {legs.map((leg, i) => (
        <div key={i} className="trv-row" style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
          <NumberRow label={`Brg ${i + 1}`} value={leg.bearing}  step={0.1} unit="°" onChange={v => update(i, { bearing: typeof v === 'number' ? v : 0 })} />
          <NumberRow label="Dist"            value={leg.distance} step={0.01} unit={leg.unit} onChange={v => update(i, { distance: typeof v === 'number' ? v : 0 })} />
          <button type="button" className="ae-save-cancel" onClick={() => removeLeg(i)} title="Remove leg">×</button>
        </div>
      ))}
      <button type="button" className="ae-add-btn" onClick={addLeg}>+ Leg</button>

      <label className="dw-row" style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        <input type="checkbox" checked={closed} onChange={e => setParam({ closed: e.target.checked } as Record<string, unknown>)} />
        <span>Closed (polygon)</span>
      </label>
    </>
  )
}
