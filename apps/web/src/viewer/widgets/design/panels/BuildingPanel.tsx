/**
 * Building wizard panel.
 *
 * Live form bound to a BuildingDraft + a "Place on map" button that
 * arms the building tool. After placement the tool fires onPlaced which
 * resets the active tool back to ``select`` so the user doesn't drop a
 * second building on the next click.
 *
 * Archetypes set sensible defaults for floor height + wall thickness +
 * default floor count. They're a starting point — every field is still
 * editable after picking an archetype.
 */
import { useEffect } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import type {
  BuildingArchetype,
  BuildingDraft,
  DesignTool,
  ElevationConfig,
  SketchFeature,
  SketchLayer,
} from '../types'
import { ARCHETYPE_DEFAULTS, DEFAULT_BUILDING_DRAFT } from '../types'
import { useBuildingTool } from '../tools/useBuildingTool'

interface BuildingPanelProps {
  viewer: CesiumViewerType | null
  activeTool: DesignTool
  elevationConfig: ElevationConfig
  draft: BuildingDraft
  onDraftChange: (next: BuildingDraft) => void
  layers: SketchLayer[]
  activeLayerId: string
  onSetTool: (tool: DesignTool) => void
  onFeatureAdded: (feature: SketchFeature) => void
}

const ARCHETYPES: { id: BuildingArchetype; label: string; hint: string }[] = [
  { id: 'residential', label: 'Residential', hint: '2.7 m floors, 2 levels' },
  { id: 'commercial', label: 'Commercial', hint: '3.5 m floors, 4 levels' },
  { id: 'warehouse', label: 'Warehouse', hint: '6 m floor, 1 level' },
  { id: 'mixed', label: 'Mixed-use', hint: '3.2 m floors, 5 levels' },
]

export default function BuildingPanel({
  viewer,
  activeTool,
  elevationConfig,
  draft,
  onDraftChange,
  layers,
  activeLayerId,
  onSetTool,
  onFeatureAdded,
}: BuildingPanelProps) {
  // Wire the click-to-place tool. It only listens while activeTool ===
  // 'building' so toggling it on/off is safe.
  useBuildingTool({
    viewer,
    activeTool,
    elevationConfig,
    draft,
    layers,
    activeLayerId,
    onFeatureAdded,
    onPlaced: () => onSetTool('select'),
  })

  // Reset to clean defaults the first time the panel mounts so old
  // BuildingDraft from a prior session doesn't carry over.
  useEffect(() => {
    if (draft.width <= 0 || draft.depth <= 0) {
      onDraftChange(DEFAULT_BUILDING_DRAFT)
    }
    // intentionally one-shot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setArchetype(a: BuildingArchetype) {
    onDraftChange({ ...draft, archetype: a, ...ARCHETYPE_DEFAULTS[a] })
  }
  function set<K extends keyof BuildingDraft>(key: K, val: BuildingDraft[K]) {
    onDraftChange({ ...draft, [key]: val })
  }
  function setNum<K extends keyof BuildingDraft>(key: K, raw: string) {
    const n = parseFloat(raw)
    if (Number.isFinite(n)) onDraftChange({ ...draft, [key]: n as BuildingDraft[K] })
  }

  const totalHeight = draft.floors * draft.floorHeight + draft.roofThickness
  const armed = activeTool === 'building'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 14 }}>
      <div>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f0f2f8' }}>
          Building wizard
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'rgba(240,242,248,0.55)' }}>
          Stack a multi-floor building into the active sketch. Each floor lands as
          its own feature on the matching preset layer (Ground, Level 1…, Roof).
        </p>
      </div>

      {/* Archetype picker — chooses sensible defaults */}
      <div>
        <Label>Archetype</Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {ARCHETYPES.map((a) => {
            const sel = draft.archetype === a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setArchetype(a.id)}
                style={{
                  padding: '8px 10px',
                  background: sel ? 'rgba(34,211,238,0.16)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${sel ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 6,
                  color: sel ? '#67e8f9' : '#f0f2f8',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  lineHeight: 1.3,
                }}
              >
                <div style={{ fontWeight: 600 }}>{a.label}</div>
                <div
                  style={{
                    fontSize: 10,
                    color: sel ? 'rgba(103,232,249,0.85)' : 'rgba(240,242,248,0.5)',
                    marginTop: 2,
                  }}
                >
                  {a.hint}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footprint */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Width (m)">
          <input
            type="number"
            min={1}
            step={0.5}
            value={draft.width}
            onChange={(e) => setNum('width', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Depth (m)">
          <input
            type="number"
            min={1}
            step={0.5}
            value={draft.depth}
            onChange={(e) => setNum('depth', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Floors">
          <input
            type="number"
            min={1}
            max={50}
            step={1}
            value={draft.floors}
            onChange={(e) => set('floors', Math.max(1, parseInt(e.target.value || '1', 10)))}
            style={inputStyle}
          />
        </Field>
        <Field label="Floor height (m)">
          <input
            type="number"
            min={0.5}
            step={0.1}
            value={draft.floorHeight}
            onChange={(e) => setNum('floorHeight', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Roof slab (m)">
          <input
            type="number"
            min={0.05}
            step={0.05}
            value={draft.roofThickness}
            onChange={(e) => setNum('roofThickness', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Heading (°)">
          <input
            type="number"
            min={0}
            max={360}
            step={1}
            value={draft.heading}
            onChange={(e) => setNum('heading', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Wall thickness (m)">
          <input
            type="number"
            min={0}
            step={0.05}
            value={draft.wallThickness}
            onChange={(e) => setNum('wallThickness', e.target.value)}
            style={inputStyle}
          />
        </Field>
        <Field label="Total height (m)">
          <div
            style={{
              ...inputStyle,
              background: 'rgba(0,0,0,0.2)',
              color: 'rgba(240,242,248,0.7)',
            }}
          >
            {totalHeight.toFixed(2)}
          </div>
        </Field>
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 12,
          color: '#f0f2f8',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={draft.includeSiteContext}
          onChange={(e) => set('includeSiteContext', e.target.checked)}
        />
        Add a Site Context slab beneath the footprint
      </label>

      {/* Place / cancel */}
      <button
        type="button"
        onClick={() => onSetTool(armed ? 'select' : 'building')}
        style={{
          padding: '10px 14px',
          background: armed ? 'rgba(251,191,36,0.18)' : '#22d3ee',
          border: `1px solid ${armed ? 'rgba(251,191,36,0.5)' : '#22d3ee'}`,
          borderRadius: 8,
          color: armed ? '#fbbf24' : '#0f0f14',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {armed
          ? 'Click on the map to place the building (or click here to cancel)'
          : `Place ${draft.floors}-storey building`}
      </button>

      {!armed && (
        <p style={{ margin: 0, fontSize: 10, color: 'rgba(240,242,248,0.5)' }}>
          Tip: load the "Building Design" layer preset first (Layers panel) so
          floors land on Ground / Level 1 / Roof rather than the active layer.
        </p>
      )}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        color: 'rgba(240,242,248,0.55)',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      {children}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 10,
          color: 'rgba(240,242,248,0.55)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 5,
  color: '#f0f2f8',
  fontSize: 12,
  outline: 'none',
  fontFamily: 'inherit',
}
