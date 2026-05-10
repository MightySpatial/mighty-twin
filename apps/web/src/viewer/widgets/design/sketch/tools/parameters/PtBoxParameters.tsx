/** Pt box — w/d/h + heading + refZ + wallThickness (matches v1 layout). */
import NumberRow from '../../../primitives/NumberRow'
import SectionLabel from '../../../primitives/SectionLabel'
import { useDraftParams, num, str } from './_helpers'

type RefZ = 'top' | 'center' | 'bot'

export default function PtBoxParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  const refZ = (str(params, 'refZ', 'bot') as RefZ)
  return (
    <>
      <NumberRow label="Width"  value={num(params, 'width', 1)}  step={0.1} unit="m" onChange={v => setParam({ width: typeof v === 'number' ? v : 1 })} />
      <NumberRow label="Depth"  value={num(params, 'depth', 1)}  step={0.1} unit="m" onChange={v => setParam({ depth: typeof v === 'number' ? v : 1 })} />
      <NumberRow label="Height" value={num(params, 'height', 1)} step={0.1} unit="m" onChange={v => setParam({ height: typeof v === 'number' ? v : 1 })} />
      <NumberRow label="Heading" value={num(params, 'heading', 0)} step={1} unit="°" onChange={v => setParam({ heading: typeof v === 'number' ? v : 0 })} />
      <NumberRow label="Wall (0=solid)" value={num(params, 'wallThickness', 0)} step={0.05} unit="m" onChange={v => setParam({ wallThickness: typeof v === 'number' ? Math.max(0, v) : 0 })} />

      <SectionLabel>Anchor (refZ)</SectionLabel>
      <div className="doe-anchor-row" role="radiogroup">
        {(['top', 'center', 'bot'] as RefZ[]).map(r => (
          <button
            key={r}
            type="button"
            className={`doe-anchor-btn${refZ === r ? ' on' : ''}`}
            onClick={() => setParam({ refZ: r } as Record<string, unknown>)}
          >
            {r === 'top' ? '⊤' : r === 'center' ? '◆' : '⊥'}
          </button>
        ))}
      </div>
    </>
  )
}
