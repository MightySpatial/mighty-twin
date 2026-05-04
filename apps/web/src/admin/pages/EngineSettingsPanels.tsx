/** Settings sections for Phase Q/R/S — three small forms backed by
 *  /api/engine/autodetect-rules, /api/workspace/branding, and
 *  /api/engine/widget-layout.
 *
 *  Each panel does a single GET on mount and a PUT on save. Schemas
 *  are intentionally loose (the backend stores arbitrary JSON values
 *  in app_settings) — these forms surface the most-used knobs and
 *  leave the rest editable via the JSON fallback.
 */

import { useEffect, useState } from 'react'
import { apiFetch } from '../hooks/useApi'

// ── Phase Q — Autodetect rules ─────────────────────────────────────────

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

export function AutodetectRulesPanel() {
  const [rules, setRules] = useState<AutodetectRules | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/engine/autodetect-rules')
      .then((d) => setRules(d as AutodetectRules))
      .catch((e: Error) => setError(e.message))
  }, [])

  if (error) return <div style={{ color: '#fca5a5', padding: 20 }}>{error}</div>
  if (!rules) return <div style={{ padding: 20, color: 'rgba(240,242,248,0.5)' }}>Loading…</div>

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/engine/autodetect-rules', {
        method: 'PUT',
        body: rules as unknown as BodyInit,
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const setList = (group: keyof AutodetectRules, field: string, value: string) => {
    const list = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    setRules({
      ...rules,
      [group]: { ...rules[group], [field]: list },
    })
  }

  return (
    <div style={panelStyle}>
      <h2 style={h2Style}>Autodetect rules</h2>
      <p style={subStyle}>
        Field-detection rules used by the data-import pipeline. The first matching pattern wins; comma-separated.
      </p>

      <Field label="Symbology field patterns">
        <input
          style={inputStyle}
          value={rules.symbology.field_patterns.join(', ')}
          onChange={(e) => setList('symbology', 'field_patterns', e.target.value)}
        />
      </Field>

      <Field label="Sublayer field patterns">
        <input
          style={inputStyle}
          value={rules.sublayer.field_patterns.join(', ')}
          onChange={(e) => setList('sublayer', 'field_patterns', e.target.value)}
        />
      </Field>

      <Field label="Label field patterns">
        <input
          style={inputStyle}
          value={rules.label.field_patterns.join(', ')}
          onChange={(e) => setList('label', 'field_patterns', e.target.value)}
        />
      </Field>

      <Field label="Pipe diameter fields">
        <input
          style={inputStyle}
          value={rules.pipes.diameter_fields.join(', ')}
          onChange={(e) => setList('pipes', 'diameter_fields', e.target.value)}
        />
      </Field>
      <Field label="Pipe depth fields">
        <input
          style={inputStyle}
          value={rules.pipes.depth_fields.join(', ')}
          onChange={(e) => setList('pipes', 'depth_fields', e.target.value)}
        />
      </Field>
      <Field label="Pipe wall-thickness fields">
        <input
          style={inputStyle}
          value={rules.pipes.wall_thickness_fields.join(', ')}
          onChange={(e) => setList('pipes', 'wall_thickness_fields', e.target.value)}
        />
      </Field>

      <Field label="Hover tooltip field patterns">
        <input
          style={inputStyle}
          value={rules.hover.field_patterns.join(', ')}
          onChange={(e) => setList('hover', 'field_patterns', e.target.value)}
        />
      </Field>

      <button onClick={save} disabled={saving} style={primaryBtnStyle}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ── Phase R — Branding ────────────────────────────────────────────────

interface Branding {
  name: string
  initials: string
  gradient: [string, string]
}

export function BrandingPanel() {
  const [branding, setBranding] = useState<Branding | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
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

  if (error) return <div style={{ color: '#fca5a5', padding: 20 }}>{error}</div>
  if (!branding) return <div style={{ padding: 20, color: 'rgba(240,242,248,0.5)' }}>Loading…</div>

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/workspace/branding', {
        method: 'PUT',
        body: (enabled ? branding : null) as unknown as BodyInit,
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={panelStyle}>
      <h2 style={h2Style}>Branding</h2>
      <p style={subStyle}>
        When enabled, the customer brand becomes the primary logo across the app and Mighty drops to a small
        "by Mighty" attribution.
      </p>

      <Field label="Enable customer branding">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      </Field>

      <div style={{ opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none' }}>
        <Field label="Customer name">
          <input
            style={inputStyle}
            value={branding.name}
            onChange={(e) => setBranding({ ...branding, name: e.target.value })}
            placeholder="e.g. Space Angel"
          />
        </Field>
        <Field label="Initials (1–2 chars, shown in the brand mark)">
          <input
            style={inputStyle}
            value={branding.initials}
            maxLength={2}
            onChange={(e) => setBranding({ ...branding, initials: e.target.value.toUpperCase() })}
            placeholder="SA"
          />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Gradient start">
            <input
              type="color"
              value={branding.gradient[0]}
              onChange={(e) => setBranding({ ...branding, gradient: [e.target.value, branding.gradient[1]] })}
            />
          </Field>
          <Field label="Gradient end">
            <input
              type="color"
              value={branding.gradient[1]}
              onChange={(e) => setBranding({ ...branding, gradient: [branding.gradient[0], e.target.value] })}
            />
          </Field>
        </div>
        <div
          style={{
            marginTop: 14,
            padding: 12,
            background: 'rgba(255,255,255,0.03)',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
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
              fontSize: 12,
            }}
          >
            {branding.initials || '?'}
          </div>
          <span style={{ fontWeight: 600 }}>{branding.name || 'Customer'}</span>
          <span
            style={{
              paddingLeft: 10,
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(240,242,248,0.4)',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            by Mighty
          </span>
        </div>
      </div>

      <button onClick={save} disabled={saving} style={{ ...primaryBtnStyle, marginTop: 16 }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ── Phase S — Widget layout ───────────────────────────────────────────

interface WidgetOverride {
  controller?: 'primary' | 'secondary' | 'none'
  position?: number
  loadMode?: 'floating' | 'sharePane' | 'drawer' | 'inline'
  defaultSize?: 'compact' | 'standard' | 'expanded'
}

const DEFAULT_WIDGET_IDS = [
  'search', 'measure', 'layers', 'legend',
  'story', 'snap', 'design', 'table', 'strike', 'terrain',
]

export function WidgetLayoutPanel() {
  const [layout, setLayout] = useState<Record<string, WidgetOverride>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch('/api/engine/widget-layout')
      .then((d) => setLayout((d as Record<string, WidgetOverride>) ?? {}))
      .catch((e: Error) => setError(e.message))
  }, [])

  const setOverride = (id: string, patch: Partial<WidgetOverride>) => {
    setLayout((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  const save = async () => {
    setSaving(true)
    try {
      await apiFetch('/api/engine/widget-layout', {
        method: 'PUT',
        body: layout as unknown as BodyInit,
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (error) return <div style={{ color: '#fca5a5', padding: 20 }}>{error}</div>

  return (
    <div style={panelStyle}>
      <h2 style={h2Style}>Widget layout</h2>
      <p style={subStyle}>
        Override the global widget catalog: controller (primary / secondary / hidden), load mode (floating /
        sharePane / drawer / inline), default size. Per-site overrides land later via Atlas Site Layout Designer.
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ color: 'rgba(240,242,248,0.5)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <th style={thStyle}>Widget</th>
            <th style={thStyle}>Controller</th>
            <th style={thStyle}>Load mode</th>
            <th style={thStyle}>Size</th>
          </tr>
        </thead>
        <tbody>
          {DEFAULT_WIDGET_IDS.map((id) => {
            const o = layout[id] ?? {}
            return (
              <tr key={id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={tdStyle}><code>{id}</code></td>
                <td style={tdStyle}>
                  <select
                    value={o.controller ?? ''}
                    onChange={(e) =>
                      setOverride(id, {
                        controller: (e.target.value || undefined) as WidgetOverride['controller'],
                      })
                    }
                    style={selectStyle}
                  >
                    <option value="">(default)</option>
                    <option value="primary">primary</option>
                    <option value="secondary">secondary</option>
                    <option value="none">hidden</option>
                  </select>
                </td>
                <td style={tdStyle}>
                  <select
                    value={o.loadMode ?? ''}
                    onChange={(e) =>
                      setOverride(id, {
                        loadMode: (e.target.value || undefined) as WidgetOverride['loadMode'],
                      })
                    }
                    style={selectStyle}
                  >
                    <option value="">(default)</option>
                    <option value="floating">floating</option>
                    <option value="sharePane">sharePane</option>
                    <option value="drawer">drawer</option>
                    <option value="inline">inline</option>
                  </select>
                </td>
                <td style={tdStyle}>
                  <select
                    value={o.defaultSize ?? ''}
                    onChange={(e) =>
                      setOverride(id, {
                        defaultSize: (e.target.value || undefined) as WidgetOverride['defaultSize'],
                      })
                    }
                    style={selectStyle}
                  >
                    <option value="">(default)</option>
                    <option value="compact">compact</option>
                    <option value="standard">standard</option>
                    <option value="expanded">expanded</option>
                  </select>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <button onClick={save} disabled={saving} style={{ ...primaryBtnStyle, marginTop: 16 }}>
        {saving ? 'Saving…' : 'Save'}
      </button>
    </div>
  )
}

// ── shared styles ──────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.6)', marginBottom: 4 }}>{label}</div>
      {children}
    </label>
  )
}

const panelStyle: React.CSSProperties = { padding: 20, maxWidth: 760, color: '#f0f2f8' }
const h2Style: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 600 }
const subStyle: React.CSSProperties = {
  margin: '4px 0 14px',
  color: 'rgba(240,242,248,0.5)',
  fontSize: 13,
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
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  width: '100%',
}
const primaryBtnStyle: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  background: '#2453ff',
  color: '#fff',
  border: 'none',
  cursor: 'pointer',
  fontSize: 13,
}
const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 6px',
  fontWeight: 500,
}
const tdStyle: React.CSSProperties = { padding: '8px 6px' }
