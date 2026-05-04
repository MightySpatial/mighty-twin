/** Phase-I primitive parameter panels — ports from DT v1.
 *
 *  Each panel is a thin React component matching DT's Vue
 *  CurveParameters/SphereParameters/etc. shape: a `value` + `onChange`
 *  pair that surfaces tool-specific knobs (smoothness, segments, radius,
 *  cap-depth, …). Geometry generation is staged — the parameter capture
 *  is here so the UI is wired as each tool's commit code lands.
 *
 *  All panels share the same compact toggle/numeric/select widgets so
 *  the design widget gets a consistent feel.
 */

import type { DesignPrimitive } from '../../types'

interface PanelProps<T> {
  value: T
  onChange: (next: T) => void
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.5)',
  marginBottom: 4,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '4px 6px',
  borderRadius: 3,
  border: '1px solid rgba(255,255,255,0.15)',
  background: 'rgba(255,255,255,0.04)',
  color: 'rgba(255,255,255,0.9)',
  font: 'inherit',
  fontSize: 12,
}

const TogglePair = ({
  options,
  value,
  onChange,
}: {
  options: [string, string]
  value: string
  onChange: (v: string) => void
}) => (
  <div style={{ display: 'flex', gap: 4 }}>
    {options.map((opt) => (
      <button
        key={opt}
        type="button"
        onClick={() => onChange(opt)}
        style={{
          flex: 1,
          padding: '3px 6px',
          fontSize: 10,
          background:
            value === opt
              ? 'rgba(99,102,241,0.3)'
              : 'rgba(255,255,255,0.08)',
          border: `1px solid ${value === opt ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.15)'}`,
          borderRadius: 3,
          color: value === opt ? '#fff' : 'rgba(255,255,255,0.7)',
          cursor: 'pointer',
        }}
      >
        {opt.toUpperCase()}
      </button>
    ))}
  </div>
)

// ── Curve ───────────────────────────────────────────────────────────────

export interface CurveParams { smoothness: 'g2' | 'g3' }
export const DEFAULT_CURVE_PARAMS: CurveParams = { smoothness: 'g2' }
export function CurveParameters({ value, onChange }: PanelProps<CurveParams>) {
  return (
    <div>
      <label style={labelStyle}>Smoothness</label>
      <TogglePair
        options={['g2', 'g3']}
        value={value.smoothness}
        onChange={(v) => onChange({ smoothness: v as 'g2' | 'g3' })}
      />
    </div>
  )
}

// ── Sphere ──────────────────────────────────────────────────────────────

export interface SphereParams { radiusM: number; segments: number }
export const DEFAULT_SPHERE_PARAMS: SphereParams = { radiusM: 5, segments: 32 }
export function SphereParameters({ value, onChange }: PanelProps<SphereParams>) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <NumField label="Radius (m)" value={value.radiusM} onChange={(v) => onChange({ ...value, radiusM: v })} />
      <NumField label="Segments" value={value.segments} onChange={(v) => onChange({ ...value, segments: v })} />
    </div>
  )
}

// ── Ellipse ─────────────────────────────────────────────────────────────

export interface EllipseParams { semiMajorM: number; semiMinorM: number; rotationDeg: number }
export const DEFAULT_ELLIPSE_PARAMS: EllipseParams = { semiMajorM: 10, semiMinorM: 5, rotationDeg: 0 }
export function EllipseParameters({ value, onChange }: PanelProps<EllipseParams>) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <NumField label="Semi-major (m)" value={value.semiMajorM} onChange={(v) => onChange({ ...value, semiMajorM: v })} />
      <NumField label="Semi-minor (m)" value={value.semiMinorM} onChange={(v) => onChange({ ...value, semiMinorM: v })} />
      <NumField label="Rotation (°)" value={value.rotationDeg} onChange={(v) => onChange({ ...value, rotationDeg: v })} />
    </div>
  )
}

// ── PolygonN ────────────────────────────────────────────────────────────

export interface PolygonNParams { sides: number; radiusM: number }
export const DEFAULT_POLYGON_N_PARAMS: PolygonNParams = { sides: 6, radiusM: 10 }
export function PolygonNParameters({ value, onChange }: PanelProps<PolygonNParams>) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <NumField label="Sides" value={value.sides} onChange={(v) => onChange({ ...value, sides: Math.max(3, v) })} />
      <NumField label="Radius (m)" value={value.radiusM} onChange={(v) => onChange({ ...value, radiusM: v })} />
    </div>
  )
}

// ── Loft ────────────────────────────────────────────────────────────────

export interface LoftParams { mode: 'linear' | 'spline'; sections: number }
export const DEFAULT_LOFT_PARAMS: LoftParams = { mode: 'spline', sections: 8 }
export function LoftParameters({ value, onChange }: PanelProps<LoftParams>) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div>
        <label style={labelStyle}>Mode</label>
        <TogglePair
          options={['linear', 'spline']}
          value={value.mode}
          onChange={(v) => onChange({ ...value, mode: v as 'linear' | 'spline' })}
        />
      </div>
      <NumField label="Sections" value={value.sections} onChange={(v) => onChange({ ...value, sections: Math.max(2, v) })} />
    </div>
  )
}

// ── Pipe ────────────────────────────────────────────────────────────────

export interface PipeParams {
  radiusM: number
  wallThicknessM: number
  depthMode: 'absolute' | 'relative_to_terrain'
  depthM: number
}
export const DEFAULT_PIPE_PARAMS: PipeParams = {
  radiusM: 0.5,
  wallThicknessM: 0.02,
  depthMode: 'relative_to_terrain',
  depthM: 1.5,
}
export function PipeParameters({ value, onChange }: PanelProps<PipeParams>) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <NumField label="Outer radius (m)" value={value.radiusM} onChange={(v) => onChange({ ...value, radiusM: v })} step={0.01} />
      <NumField label="Wall thickness (m)" value={value.wallThicknessM} onChange={(v) => onChange({ ...value, wallThicknessM: v })} step={0.005} />
      <div>
        <label style={labelStyle}>Depth mode</label>
        <TogglePair
          options={['absolute', 'relative_to_terrain']}
          value={value.depthMode}
          onChange={(v) => onChange({ ...value, depthMode: v as PipeParams['depthMode'] })}
        />
      </div>
      <NumField label="Depth (m)" value={value.depthM} onChange={(v) => onChange({ ...value, depthM: v })} step={0.1} />
    </div>
  )
}

// ── Cone ────────────────────────────────────────────────────────────────

export interface ConeParams { radiusM: number; heightM: number; segments: number }
export const DEFAULT_CONE_PARAMS: ConeParams = { radiusM: 5, heightM: 10, segments: 32 }
export function ConeParameters({ value, onChange }: PanelProps<ConeParams>) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <NumField label="Radius (m)" value={value.radiusM} onChange={(v) => onChange({ ...value, radiusM: v })} />
      <NumField label="Height (m)" value={value.heightM} onChange={(v) => onChange({ ...value, heightM: v })} />
      <NumField label="Segments" value={value.segments} onChange={(v) => onChange({ ...value, segments: Math.max(3, v) })} />
    </div>
  )
}

// ── Extrude ─────────────────────────────────────────────────────────────

export interface ExtrudeParams { heightM: number; capTop: boolean; capBottom: boolean }
export const DEFAULT_EXTRUDE_PARAMS: ExtrudeParams = { heightM: 5, capTop: true, capBottom: true }
export function ExtrudeParameters({ value, onChange }: PanelProps<ExtrudeParams>) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <NumField label="Height (m)" value={value.heightM} onChange={(v) => onChange({ ...value, heightM: v })} />
      <CheckboxField label="Cap top" value={value.capTop} onChange={(v) => onChange({ ...value, capTop: v })} />
      <CheckboxField label="Cap bottom" value={value.capBottom} onChange={(v) => onChange({ ...value, capBottom: v })} />
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

function NumField({
  label, value, onChange, step = 1,
}: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={inputStyle}
      />
    </div>
  )
}

function CheckboxField({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

// ── Registry ────────────────────────────────────────────────────────────

export const PRIMITIVE_REGISTRY: Record<DesignPrimitive, { label: string; defaults: object }> = {
  curve:    { label: 'Curve',     defaults: DEFAULT_CURVE_PARAMS },
  sphere:   { label: 'Sphere',    defaults: DEFAULT_SPHERE_PARAMS },
  ellipse:  { label: 'Ellipse',   defaults: DEFAULT_ELLIPSE_PARAMS },
  polygonN: { label: 'Polygon N', defaults: DEFAULT_POLYGON_N_PARAMS },
  loft:     { label: 'Loft',      defaults: DEFAULT_LOFT_PARAMS },
  pipe:     { label: 'Pipe',      defaults: DEFAULT_PIPE_PARAMS },
  cone:     { label: 'Cone',      defaults: DEFAULT_CONE_PARAMS },
  extrude:  { label: 'Extrude',   defaults: DEFAULT_EXTRUDE_PARAMS },
}
