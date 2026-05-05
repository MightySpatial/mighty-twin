/** Settings — Engine + Workspace admin panels. Refreshed UX:
 *
 *  Autodetect    — card-per-section with chip-based pattern editors,
 *                  inline live preview ("would match: ..."), explicit
 *                  Add-pattern affordances instead of comma strings.
 *  Branding      — toggle + form + live preview chip showing the
 *                  topbar brand zone exactly as it'll render.
 *  Widget layout — visual three-zone editor (Primary / Secondary /
 *                  Hidden) with click-to-move arrows, mini live preview
 *                  of the bottom rails. No drag-drop in v1; click is
 *                  faster on mobile and keyboard-accessible.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  X as XIcon,
  Plus as PlusIcon,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Eye as EyeIcon,
  Layers,
  List,
  Search,
  Ruler,
  Camera,
  Hexagon as HexagonIcon,
  Table as TableIcon,
  BookOpen,
  Slash,
  Mountain,
  Palette,
  Pipette,
  Tag,
  Type,
  Layers3,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

// ── shared layout primitives ──────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  padding: 24,
  maxWidth: 880,
  color: '#f0f2f8',
}

const cardStyle: React.CSSProperties = {
  padding: 18,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 10,
  marginBottom: 14,
}

const cardHeader: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  marginBottom: 12,
}

const cardTitle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  margin: 0,
}

const cardDesc: React.CSSProperties = {
  fontSize: 12,
  color: 'rgba(240,242,248,0.5)',
  marginTop: 2,
}

const heroIconStyle = (gradient: [string, string]): React.CSSProperties => ({
  width: 32,
  height: 32,
  background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#fff',
})

const primaryBtn: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  background: '#2453ff',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
}

const ghostBtn: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 6,
  background: 'transparent',
  color: 'rgba(240,242,248,0.7)',
  border: '1px solid rgba(255,255,255,0.1)',
  cursor: 'pointer',
  fontSize: 12,
}

// ── chip + chip-input ─────────────────────────────────────────────────

function Chip({
  text,
  onRemove,
}: {
  text: string
  onRemove?: () => void
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        background: 'rgba(36,83,255,0.14)',
        border: '1px solid rgba(36,83,255,0.32)',
        borderRadius: 999,
        color: 'rgba(240,242,248,0.92)',
        fontSize: 12,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      {text}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'rgba(240,242,248,0.5)',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label={`Remove ${text}`}
        >
          <XIcon size={12} />
        </button>
      )}
    </span>
  )
}

function ChipInput({
  values,
  onChange,
  placeholder = 'Add pattern…',
}: {
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [pending, setPending] = useState('')
  const add = () => {
    const v = pending.trim()
    if (!v) return
    if (values.includes(v)) {
      setPending('')
      return
    }
    onChange([...values, v])
    setPending('')
  }
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        padding: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
        minHeight: 38,
      }}
    >
      {values.map((v) => (
        <Chip key={v} text={v} onRemove={() => onChange(values.filter((x) => x !== v))} />
      ))}
      <input
        value={pending}
        onChange={(e) => setPending(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add()
          } else if (e.key === 'Backspace' && !pending && values.length > 0) {
            onChange(values.slice(0, -1))
          }
        }}
        onBlur={add}
        placeholder={placeholder}
        style={{
          flex: '1 0 120px',
          minWidth: 120,
          background: 'transparent',
          border: 'none',
          color: '#f0f2f8',
          font: 'inherit',
          fontSize: 13,
          outline: 'none',
        }}
      />
    </div>
  )
}

// ── Phase Q · Autodetect rules — card-based ──────────────────────────

interface AutodetectRules {
  symbology: { field_patterns: string[]; fallback: string }
  sublayer: { field_patterns: string[]; fallback: string | null }
  label: { field_patterns: string[]; expression_template: string; global_caching: boolean }
  pipes: {
    diameter_fields: string[]
    depth_fields: string[]
    wall_thickness_fields: string[]
    default_units: string
  }
  hover: { field_patterns: string[] }
}

const SAMPLE_FIELDS = [
  'category',
  'pipe_diameter_mm',
  'invert_level',
  'name',
  'sublayer',
  'tooltip',
  'asset_id',
  'class',
  'wall_thickness',
] as const

function PreviewLine({
  label,
  match,
  patterns,
}: {
  label: string
  match: string | null
  patterns: string[]
}) {
  const matched = SAMPLE_FIELDS.find((f) => patterns.some((p) => f.includes(p)))
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 10px',
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 6,
        fontSize: 12,
        color: 'rgba(240,242,248,0.7)',
      }}
    >
      <EyeIcon size={12} style={{ color: matched ? '#34d399' : 'rgba(240,242,248,0.3)' }} />
      <span>Sample fields → matched as <b>{label}</b>:</span>
      <code
        style={{
          color: matched ? '#34d399' : 'rgba(240,242,248,0.4)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {matched || '(none)'}
      </code>
    </div>
  )
}

export function AutodetectRulesPanel() {
  const [rules, setRules] = useState<AutodetectRules | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/engine/autodetect-rules')
      .then((d) => setRules(d as AutodetectRules))
      .catch((e: Error) => setError(e.message))
  }, [])

  const setGroup = <K extends keyof AutodetectRules>(
    group: K,
    patch: Partial<AutodetectRules[K]>,
  ) => {
    if (!rules) return
    setRules({ ...rules, [group]: { ...rules[group], ...patch } })
  }

  const save = async () => {
    if (!rules) return
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/engine/autodetect-rules', {
        method: 'PUT',
        body: rules as unknown as BodyInit,
      })
      setSavedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (error && !rules) return <div style={{ ...pageStyle, color: '#fca5a5' }}>{error}</div>
  if (!rules) return <div style={{ ...pageStyle, color: 'rgba(240,242,248,0.5)' }}>Loading…</div>

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Autodetect rules</h2>
        <p style={cardDesc}>
          Field-detection rules used by the data-import pipeline. The first matching pattern wins. Press
          Enter or comma to add a chip; Backspace deletes the last one.
        </p>
      </div>

      {/* Symbology */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div style={heroIconStyle(['#f59e0b', '#fb7185'])}>
            <Palette size={18} />
          </div>
          <div>
            <h3 style={cardTitle}>Symbology field</h3>
            <div style={cardDesc}>Which attribute drives layer color/category styling.</div>
          </div>
        </div>
        <ChipInput
          values={rules.symbology.field_patterns}
          onChange={(next) => setGroup('symbology', { field_patterns: next })}
        />
        <div style={{ marginTop: 8 }}>
          <PreviewLine
            label="symbology"
            match={null}
            patterns={rules.symbology.field_patterns}
          />
        </div>
      </div>

      {/* Sublayer */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div style={heroIconStyle(['#34d399', '#22d3ee'])}>
            <Layers3 size={18} />
          </div>
          <div>
            <h3 style={cardTitle}>Sublayer field</h3>
            <div style={cardDesc}>Attribute that splits a layer into sub-groups.</div>
          </div>
        </div>
        <ChipInput
          values={rules.sublayer.field_patterns}
          onChange={(next) => setGroup('sublayer', { field_patterns: next })}
        />
        <div style={{ marginTop: 8 }}>
          <PreviewLine label="sublayer" match={null} patterns={rules.sublayer.field_patterns} />
        </div>
      </div>

      {/* Label */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div style={heroIconStyle(['#a78bfa', '#ec4899'])}>
            <Type size={18} />
          </div>
          <div>
            <h3 style={cardTitle}>Label field</h3>
            <div style={cardDesc}>What text shows next to features. Template uses {`{value}`}.</div>
          </div>
        </div>
        <ChipInput
          values={rules.label.field_patterns}
          onChange={(next) => setGroup('label', { field_patterns: next })}
        />
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(240,242,248,0.7)' }}
          >
            <input
              type="checkbox"
              checked={rules.label.global_caching}
              onChange={(e) => setGroup('label', { global_caching: e.target.checked })}
            />
            Global caching
          </label>
          <span style={{ color: 'rgba(240,242,248,0.4)', fontSize: 12 }}>Template:</span>
          <input
            value={rules.label.expression_template}
            onChange={(e) => setGroup('label', { expression_template: e.target.value })}
            style={{
              flex: 1,
              padding: '6px 10px',
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.04)',
              color: '#f0f2f8',
              fontSize: 13,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          />
        </div>
      </div>

      {/* Pipes */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div style={heroIconStyle(['#22d3ee', '#0ea5e9'])}>
            <Pipette size={18} />
          </div>
          <div>
            <h3 style={cardTitle}>3D pipe fields</h3>
            <div style={cardDesc}>Surveyors call diameter / depth / wall many things.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.5)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Diameter
            </div>
            <ChipInput
              values={rules.pipes.diameter_fields}
              onChange={(next) => setGroup('pipes', { diameter_fields: next })}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.5)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Depth / invert
            </div>
            <ChipInput
              values={rules.pipes.depth_fields}
              onChange={(next) => setGroup('pipes', { depth_fields: next })}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.5)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Wall thickness
            </div>
            <ChipInput
              values={rules.pipes.wall_thickness_fields}
              onChange={(next) => setGroup('pipes', { wall_thickness_fields: next })}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'rgba(240,242,248,0.7)' }}>Default units:</span>
            <select
              value={rules.pipes.default_units}
              onChange={(e) => setGroup('pipes', { default_units: e.target.value })}
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.04)',
                color: '#f0f2f8',
                fontSize: 12,
              }}
            >
              <option value="mm">mm</option>
              <option value="m">m</option>
              <option value="in">in</option>
            </select>
          </div>
        </div>
      </div>

      {/* Hover */}
      <div style={cardStyle}>
        <div style={cardHeader}>
          <div style={heroIconStyle(['#fb7185', '#a78bfa'])}>
            <Tag size={18} />
          </div>
          <div>
            <h3 style={cardTitle}>Hover tooltip field</h3>
            <div style={cardDesc}>Shown on hover; first matched field wins.</div>
          </div>
        </div>
        <ChipInput
          values={rules.hover.field_patterns}
          onChange={(next) => setGroup('hover', { field_patterns: next })}
        />
      </div>

      {/* Save bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 18,
          paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <button onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {savedAt && (
          <span style={{ fontSize: 11, color: '#34d399' }}>
            Saved · {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        {error && <span style={{ fontSize: 11, color: '#fca5a5' }}>{error}</span>}
      </div>
    </div>
  )
}

// ── Phase R · Branding — live preview ────────────────────────────────

interface Branding {
  name: string
  initials: string
  gradient: [string, string]
}

export function BrandingPanel() {
  const [branding, setBranding] = useState<Branding | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/workspace/branding')
      .then((d) => {
        if (d) {
          setEnabled(true)
          setBranding(d as Branding)
        } else {
          setEnabled(false)
          setBranding({ name: '', initials: '', gradient: ['#f97316', '#ef4444'] })
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error && !branding) return <div style={{ ...pageStyle, color: '#fca5a5' }}>{error}</div>
  if (!branding) return <div style={{ ...pageStyle, color: 'rgba(240,242,248,0.5)' }}>Loading…</div>

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/workspace/branding', {
        method: 'PUT',
        body: (enabled ? branding : null) as unknown as BodyInit,
      })
      setSavedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Branding</h2>
        <p style={cardDesc}>
          When enabled, your workspace's brand becomes the primary mark across the app and Mighty drops to
          a small attribution. Visible to public viewers too.
        </p>
      </div>

      {/* Live preview */}
      <div
        style={{
          padding: 14,
          background: 'rgba(15,15,20,0.92)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Top-bar preview
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {enabled ? (
            <>
              <div
                style={{
                  width: 32,
                  height: 32,
                  background: `linear-gradient(135deg, ${branding.gradient[0]}, ${branding.gradient[1]})`,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {branding.initials || '?'}
              </div>
              <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>
                {branding.name || 'Customer'}
              </span>
              <span
                style={{
                  paddingLeft: 12,
                  marginLeft: 4,
                  borderLeft: '1px solid rgba(255,255,255,0.1)',
                  color: 'rgba(240,242,248,0.4)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    width: 10,
                    height: 10,
                    background: 'linear-gradient(135deg, #2453ff, #a78bfa)',
                    borderRadius: 2,
                    transform: 'rotate(8deg)',
                    opacity: 0.7,
                  }}
                />
                by Mighty
              </span>
            </>
          ) : (
            <>
              <div
                style={{
                  width: 14,
                  height: 14,
                  background: 'linear-gradient(135deg, #2453ff, #a78bfa)',
                  borderRadius: 4,
                  transform: 'rotate(8deg)',
                }}
              />
              <span style={{ color: '#2453ff', fontSize: 14, fontWeight: 600 }}>MightyTwin</span>
            </>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span style={{ fontWeight: 500 }}>Enable customer branding</span>
        </label>
        <div style={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
            <Field label="Customer name">
              <input
                value={branding.name}
                onChange={(e) => setBranding({ ...branding, name: e.target.value })}
                placeholder="e.g. Space Angel"
                style={inputStyle}
              />
            </Field>
            <Field label="Initials">
              <input
                value={branding.initials}
                maxLength={2}
                onChange={(e) =>
                  setBranding({ ...branding, initials: e.target.value.toUpperCase() })
                }
                placeholder="SA"
                style={{ ...inputStyle, textAlign: 'center', letterSpacing: '0.04em' }}
              />
            </Field>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Gradient start">
              <input
                type="color"
                value={branding.gradient[0]}
                onChange={(e) =>
                  setBranding({ ...branding, gradient: [e.target.value, branding.gradient[1]] })
                }
                style={{ ...inputStyle, height: 40, padding: 4 }}
              />
            </Field>
            <Field label="Gradient end">
              <input
                type="color"
                value={branding.gradient[1]}
                onChange={(e) =>
                  setBranding({ ...branding, gradient: [branding.gradient[0], e.target.value] })
                }
                style={{ ...inputStyle, height: 40, padding: 4 }}
              />
            </Field>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 18,
          paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <button onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {savedAt && (
          <span style={{ fontSize: 11, color: '#34d399' }}>
            Saved · {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        {error && <span style={{ fontSize: 11, color: '#fca5a5' }}>{error}</span>}
      </div>
    </div>
  )
}

// ── Phase S · Widget layout — visual zones ───────────────────────────

type Controller = 'primary' | 'secondary' | 'none'

interface WidgetOverride {
  controller?: Controller
  position?: number
  loadMode?: 'floating' | 'sharePane' | 'drawer' | 'inline'
  defaultSize?: 'compact' | 'standard' | 'expanded'
}

type IconCmp = React.ComponentType<{ size?: number | string }>
const WIDGETS: { id: string; label: string; icon: IconCmp; defaultController: Controller }[] = [
  { id: 'search',   label: 'Search',   icon: Search,        defaultController: 'primary' },
  { id: 'measure',  label: 'Measure',  icon: Ruler,         defaultController: 'primary' },
  { id: 'layers',   label: 'Layers',   icon: Layers,        defaultController: 'primary' },
  { id: 'legend',   label: 'Legend',   icon: List,          defaultController: 'primary' },
  { id: 'story',    label: 'Story',    icon: BookOpen,      defaultController: 'secondary' },
  { id: 'snap',     label: 'Snap',     icon: Camera,        defaultController: 'secondary' },
  { id: 'design',   label: 'Design',   icon: HexagonIcon,   defaultController: 'secondary' },
  { id: 'table',    label: 'Table',    icon: TableIcon,     defaultController: 'secondary' },
  { id: 'strike',   label: 'Strike',   icon: Slash,         defaultController: 'secondary' },
  { id: 'terrain',  label: 'Terrain',  icon: Mountain,      defaultController: 'secondary' },
]

export function WidgetLayoutPanel() {
  const [overrides, setOverrides] = useState<Record<string, WidgetOverride>>({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/engine/widget-layout')
      .then((d) => setOverrides((d as Record<string, WidgetOverride>) ?? {}))
      .catch((e: Error) => setError(e.message))
  }, [])

  const effectiveController = (id: string): Controller => {
    const o = overrides[id]?.controller
    if (o) return o
    return WIDGETS.find((w) => w.id === id)!.defaultController
  }
  const effectivePosition = (id: string): number => {
    const o = overrides[id]?.position
    if (o !== undefined) return o
    return WIDGETS.findIndex((w) => w.id === id)
  }

  const grouped = useMemo(() => {
    const g: Record<Controller, typeof WIDGETS> = { primary: [], secondary: [], none: [] }
    for (const w of WIDGETS) {
      g[effectiveController(w.id)].push(w)
    }
    for (const k of Object.keys(g) as Controller[]) {
      g[k].sort((a, b) => effectivePosition(a.id) - effectivePosition(b.id))
    }
    return g
  }, [overrides])

  const setController = (id: string, controller: Controller) => {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], controller } }))
  }
  const move = (id: string, delta: -1 | 1) => {
    const c = effectiveController(id)
    const peers = grouped[c]
    const idx = peers.findIndex((w) => w.id === id)
    const target = idx + delta
    if (target < 0 || target >= peers.length) return
    setOverrides((prev) => {
      const next = { ...prev }
      // simple swap of explicit positions
      next[peers[target].id] = { ...next[peers[target].id], position: idx }
      next[id] = { ...next[id], position: target }
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/engine/widget-layout', {
        method: 'PUT',
        body: overrides as unknown as BodyInit,
      })
      setSavedAt(Date.now())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Widget layout</h2>
        <p style={cardDesc}>
          Drag the widgets between zones with the chevron buttons. Primary is the cobalt-tinted bottom rail
          (always visible); Secondary is the neutral row above (collapses behind "More ▾"); Hidden removes
          the widget from this workspace.
        </p>
      </div>

      {/* Live mini preview */}
      <div
        style={{
          padding: '14px 14px 18px',
          background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.4)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Bottom-rail preview
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {grouped.secondary.length > 0 && (
            <PreviewRail widgets={grouped.secondary} variant="secondary" />
          )}
          <PreviewRail widgets={grouped.primary} variant="primary" />
        </div>
      </div>

      {/* Three-zone layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <Zone label="Primary" tint="rgba(36,83,255,0.10)" border="rgba(36,83,255,0.32)">
          {grouped.primary.map((w, idx) => (
            <ZoneRow
              key={w.id}
              widget={w}
              canUp={idx > 0}
              canDown={idx < grouped.primary.length - 1}
              onUp={() => move(w.id, -1)}
              onDown={() => move(w.id, 1)}
              onMoveTo={(c) => setController(w.id, c)}
              currentController="primary"
            />
          ))}
        </Zone>
        <Zone label="Secondary" tint="rgba(255,255,255,0.04)" border="rgba(255,255,255,0.07)">
          {grouped.secondary.map((w, idx) => (
            <ZoneRow
              key={w.id}
              widget={w}
              canUp={idx > 0}
              canDown={idx < grouped.secondary.length - 1}
              onUp={() => move(w.id, -1)}
              onDown={() => move(w.id, 1)}
              onMoveTo={(c) => setController(w.id, c)}
              currentController="secondary"
            />
          ))}
        </Zone>
        <Zone label="Hidden" tint="rgba(0,0,0,0.2)" border="rgba(255,255,255,0.05)">
          {grouped.none.map((w) => (
            <ZoneRow
              key={w.id}
              widget={w}
              canUp={false}
              canDown={false}
              onUp={() => {}}
              onDown={() => {}}
              onMoveTo={(c) => setController(w.id, c)}
              currentController="none"
            />
          ))}
        </Zone>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginTop: 18,
          paddingTop: 18,
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <button onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button
          onClick={() => setOverrides({})}
          style={ghostBtn}
        >
          Reset to defaults
        </button>
        {savedAt && (
          <span style={{ fontSize: 11, color: '#34d399' }}>
            Saved · {new Date(savedAt).toLocaleTimeString()}
          </span>
        )}
        {error && <span style={{ fontSize: 11, color: '#fca5a5' }}>{error}</span>}
      </div>
    </div>
  )
}

function Zone({
  label,
  tint,
  border,
  children,
}: {
  label: string
  tint: string
  border: string
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: tint,
        border: `1px solid ${border}`,
        borderRadius: 10,
        padding: 10,
        minHeight: 200,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(240,242,248,0.4)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  )
}

function ZoneRow({
  widget,
  canUp,
  canDown,
  onUp,
  onDown,
  onMoveTo,
  currentController,
}: {
  widget: { id: string; label: string; icon: IconCmp }
  canUp: boolean
  canDown: boolean
  onUp: () => void
  onDown: () => void
  onMoveTo: (c: Controller) => void
  currentController: Controller
}) {
  const Icon = widget.icon
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 6,
      }}
    >
      <Icon size={14} />
      <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{widget.label}</span>
      <button
        type="button"
        onClick={onUp}
        disabled={!canUp}
        style={{ ...iconBtn, opacity: canUp ? 1 : 0.3 }}
        aria-label="Move up"
      >
        <ChevronUp size={12} />
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={!canDown}
        style={{ ...iconBtn, opacity: canDown ? 1 : 0.3 }}
        aria-label="Move down"
      >
        <ChevronDown size={12} />
      </button>
      <button
        type="button"
        onClick={() =>
          onMoveTo(
            currentController === 'primary'
              ? 'secondary'
              : currentController === 'secondary'
              ? 'none'
              : 'primary',
          )
        }
        style={iconBtn}
        aria-label="Move to next zone"
        title={
          currentController === 'primary'
            ? 'Move to Secondary'
            : currentController === 'secondary'
            ? 'Move to Hidden'
            : 'Move to Primary'
        }
      >
        {currentController === 'primary' ? (
          <ChevronsDown size={12} />
        ) : currentController === 'secondary' ? (
          <ChevronsDown size={12} />
        ) : (
          <ChevronsUp size={12} />
        )}
      </button>
    </div>
  )
}

function PreviewRail({
  widgets,
  variant,
}: {
  widgets: { id: string; label: string; icon: IconCmp }[]
  variant: 'primary' | 'secondary'
}) {
  if (widgets.length === 0) return null
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 6,
        borderRadius: 14,
        border: '1px solid rgba(255,255,255,0.07)',
        background:
          variant === 'primary' ? 'rgba(36,83,255,0.10)' : 'rgba(17,20,29,0.7)',
        borderColor: variant === 'primary' ? 'rgba(36,83,255,0.22)' : 'rgba(255,255,255,0.07)',
      }}
    >
      {widgets.map((w) => {
        const Icon = w.icon
        return (
          <div
            key={w.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 10px',
              borderRadius: 8,
              fontSize: 9,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'rgba(240,242,248,0.7)',
            }}
          >
            <Icon size={14} />
            {w.label}
          </div>
        )
      })}
    </div>
  )
}

// ── shared helpers ────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.6)', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#f0f2f8',
  font: 'inherit',
  fontSize: 13,
}

const iconBtn: React.CSSProperties = {
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  color: 'rgba(240,242,248,0.7)',
  borderRadius: 4,
  cursor: 'pointer',
  padding: 0,
}
