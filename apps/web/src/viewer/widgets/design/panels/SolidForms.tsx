/**
 * MightyTwin — Solid Parameter Forms
 * Inline editing forms for Box, Pit, and Cylinder draft parameters.
 */
import type { BoxDraft, PitDraft, CylDraft, SolidDraft } from '../types'

function NumField({ label, value, step, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="draw-offset-row">
      <label className="draw-section-label">{label}</label>
      <input
        className="draw-offset-input"
        type="number"
        step={step ?? 0.1}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}

function PlaceCancelRow({ onPlace, onCancel }: { onPlace: () => void; onCancel: () => void }) {
  return (
    <div className="draw-tools-grid" style={{ marginTop: 6 }}>
      <button className="draw-tool-btn active" onClick={onPlace}>Place</button>
      <button className="draw-tool-btn" onClick={onCancel}>Cancel</button>
    </div>
  )
}

export function SolidBoxForm({ draft, onChange, onPlace, onCancel }: { draft: BoxDraft; onChange: (d: SolidDraft) => void; onPlace: () => void; onCancel: () => void }) {
  const set = (patch: Partial<BoxDraft>) => onChange({ ...draft, ...patch })
  return (
    <div className="draw-elevation-section">
      <div className="draw-section-label">Box Parameters</div>
      <NumField label="Width (m)" value={draft.width} onChange={v => set({ width: v })} />
      <NumField label="Depth (m)" value={draft.depth} onChange={v => set({ depth: v })} />
      <NumField label="Height (m)" value={draft.height} onChange={v => set({ height: v })} />
      <NumField label="Heading (&deg;)" value={draft.heading} step={1} onChange={v => set({ heading: v })} />
      <NumField label="Wall (m, 0=solid)" value={draft.wallThickness} onChange={v => set({ wallThickness: v })} />
      <PlaceCancelRow onPlace={onPlace} onCancel={onCancel} />
    </div>
  )
}

export function SolidPitForm({ draft, onChange, onPlace, onCancel }: { draft: PitDraft; onChange: (d: SolidDraft) => void; onPlace: () => void; onCancel: () => void }) {
  const set = (patch: Partial<PitDraft>) => onChange({ ...draft, ...patch })
  return (
    <div className="draw-elevation-section">
      <div className="draw-section-label">Pit Parameters</div>
      <div className="draw-offset-row">
        <label className="draw-section-label">Shape</label>
        <select
          className="draw-elevation-select"
          value={draft.shape}
          onChange={e => set({ shape: e.target.value as 'square' | 'round' })}
        >
          <option value="square">Square</option>
          <option value="round">Round</option>
        </select>
      </div>
      {draft.shape === 'square' ? (
        <>
          <NumField label="Width (m)" value={draft.width} onChange={v => set({ width: v })} />
          <NumField label="Depth (m)" value={draft.depth} onChange={v => set({ depth: v })} />
        </>
      ) : (
        <NumField label="Radius (m)" value={draft.radius} onChange={v => set({ radius: v })} />
      )}
      <NumField label="Height (m)" value={draft.height} onChange={v => set({ height: v })} />
      <NumField label="Heading (&deg;)" value={draft.heading} step={1} onChange={v => set({ heading: v })} />
      <NumField label="Wall (m)" value={draft.wallThickness} onChange={v => set({ wallThickness: v })} />
      <NumField label="Floor (m)" value={draft.floorThickness} onChange={v => set({ floorThickness: v })} />
      <PlaceCancelRow onPlace={onPlace} onCancel={onCancel} />
    </div>
  )
}

export function SolidCylForm({ draft, onChange, onPlace, onCancel }: { draft: CylDraft; onChange: (d: SolidDraft) => void; onPlace: () => void; onCancel: () => void }) {
  const set = (patch: Partial<CylDraft>) => onChange({ ...draft, ...patch })
  return (
    <div className="draw-elevation-section">
      <div className="draw-section-label">Cylinder Parameters</div>
      <NumField label="Radius (m)" value={draft.radius} onChange={v => set({ radius: v })} />
      <NumField label="Height (m)" value={draft.height} onChange={v => set({ height: v })} />
      <NumField label="Heading (&deg;)" value={draft.heading} step={1} onChange={v => set({ heading: v })} />
      <NumField label="Pitch (&deg;)" value={draft.pitch} step={1} onChange={v => set({ pitch: v })} />
      <NumField label="Roll (&deg;)" value={draft.roll} step={1} onChange={v => set({ roll: v })} />
      <NumField label="Wall (m, 0=solid)" value={draft.wallThickness} onChange={v => set({ wallThickness: v })} />
      <PlaceCancelRow onPlace={onPlace} onCancel={onCancel} />
    </div>
  )
}
