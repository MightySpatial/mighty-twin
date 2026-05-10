/** Curve tool — G2 / G3 continuity toggle. v1's CurveParameters.vue. */
import SectionLabel from '../../../primitives/SectionLabel'
import ToggleGroup from '../../../primitives/ToggleGroup'
import { useDraftParams, str } from './_helpers'

type Continuity = 'g2' | 'g3'

export default function CurveParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  const continuity = (str(params, 'continuity', 'g2') === 'g3' ? 'g3' : 'g2') as Continuity

  return (
    <div className="dw-row">
      <SectionLabel>Continuity</SectionLabel>
      <ToggleGroup<Continuity>
        value={continuity}
        onChange={v => setParam({ continuity: v } as Record<string, unknown>)}
        options={[
          { value: 'g2', label: 'G2 — smooth' },
          { value: 'g3', label: 'G3 — curvature' },
        ]}
      />
    </div>
  )
}
