/** Pt pit — shape (square/round) + size + height + wall + floor + refZ. */
import NumberRow from '../../../primitives/NumberRow'
import SectionLabel from '../../../primitives/SectionLabel'
import ToggleGroup from '../../../primitives/ToggleGroup'
import { useDraftParams, num, str } from './_helpers'

type Shape = 'square' | 'round'
type RefZ = 'top' | 'center' | 'bot'

export default function PtPitParameters({ draftNodeId }: { draftNodeId: string }) {
  const { params, setParam } = useDraftParams(draftNodeId)
  const shape = (str(params, 'shape', 'square') as Shape)
  const refZ = (str(params, 'refZ', 'top') as RefZ)
  return (
    <>
      <div className="dw-row">
        <SectionLabel>Shape</SectionLabel>
        <ToggleGroup<Shape>
          value={shape}
          onChange={v => setParam({ shape: v } as Record<string, unknown>)}
          options={[{ value: 'square', label: 'Square' }, { value: 'round', label: 'Round' }]}
        />
      </div>
      {shape === 'round'
        ? <NumberRow label="Radius" value={num(params, 'radius', 1)} step={0.1} unit="m" onChange={v => setParam({ radius: typeof v === 'number' ? v : 1 })} />
        : (<>
            <NumberRow label="Width" value={num(params, 'width', 2)} step={0.1} unit="m" onChange={v => setParam({ width: typeof v === 'number' ? v : 2 })} />
            <NumberRow label="Depth" value={num(params, 'depth', 2)} step={0.1} unit="m" onChange={v => setParam({ depth: typeof v === 'number' ? v : 2 })} />
          </>)}
      <NumberRow label="Height" value={num(params, 'height', 2)} step={0.1} unit="m" onChange={v => setParam({ height: typeof v === 'number' ? v : 2 })} />
      <NumberRow label="Wall"   value={num(params, 'wallThickness', 0.2)}  step={0.05} unit="m" onChange={v => setParam({ wallThickness: typeof v === 'number' ? Math.max(0, v) : 0.2 })} />
      <NumberRow label="Floor"  value={num(params, 'floorThickness', 0.2)} step={0.05} unit="m" onChange={v => setParam({ floorThickness: typeof v === 'number' ? Math.max(0, v) : 0.2 })} />

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
