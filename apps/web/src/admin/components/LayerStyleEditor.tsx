/** Layer style editor — T+1290.
 *
 *  Visual editor for the JSON ``style`` blob on each Layer. Lives as
 *  a modal triggered from each LayerRow on SiteDetailPage. Saves via
 *  PATCH /api/spatial/sites/{slug}/layers/{id} so the existing route
 *  doesn't need extending.
 *
 *  The shape is intentionally permissive — we read whatever's there
 *  with sane defaults, and write back a normalised style envelope. If
 *  a layer has style keys we don't surface (rare, third-party-set), we
 *  preserve them on save by spreading the original style under our
 *  changes.
 *
 *  Cobalt accent colour palette is the same one MapShell uses so site
 *  + layer styling stays visually coherent.
 */

import { useEffect, useState } from 'react'
import { Check, Loader, Palette, X } from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

interface LayerStyle {
  strokeColor?: string
  fillColor?: string
  lineWidth?: number
  pointSize?: number
  opacity?: number
  labelField?: string
  labelColor?: string
  labelSize?: number
  labelOutline?: boolean
  outline?: boolean
  outlineColor?: string
  outlineWidth?: number
  [key: string]: unknown
}

interface LayerLike {
  id: string
  name: string
  type: string
  style?: Record<string, unknown> | LayerStyle | null
}

interface Props {
  siteSlug: string
  layer: LayerLike
  onClose: () => void
  onSaved: (style: LayerStyle) => void
}

const PALETTE = [
  '#2453ff', // cobalt
  '#3b82f6', // blue (water)
  '#06b6d4', // cyan (drain)
  '#34d399', // green
  '#a78bfa', // violet (comms)
  '#ec4899', // pink
  '#fbbf24', // amber (gas)
  '#f59e0b', // orange
  '#ef4444', // red (electric)
  '#a16207', // brown (sewer)
  '#9ca3af', // grey (unid)
  '#0f172a', // ink
]

export default function LayerStyleEditor({ siteSlug, layer, onClose, onSaved }: Props) {
  const [style, setStyle] = useState<LayerStyle>(() => ({ ...(layer.style || {}) }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setStyle({ ...(layer.style || {}) })
  }, [layer])

  const isVector = ['vector', 'geojson', 'feature', 'kml', 'czml'].includes(layer.type)

  const stroke = style.strokeColor ?? style.outlineColor ?? '#2453ff'
  const fill = style.fillColor ?? '#2453ff'
  const lineWidth = numericOr(style.lineWidth, 3)
  const pointSize = numericOr(style.pointSize, 8)
  const opacity = numericOr(style.opacity, 1)
  const labelField = (style.labelField as string) || ''
  const labelColor = (style.labelColor as string) || '#f0f2f8'
  const labelSize = numericOr(style.labelSize, 12)
  const labelOutline = style.labelOutline !== false
  const outline = style.outline !== false
  const outlineColor = (style.outlineColor as string) || '#0f0f14'
  const outlineWidth = numericOr(style.outlineWidth, 1)

  function patch(diff: Partial<LayerStyle>) {
    setStyle((prev) => ({ ...prev, ...diff }))
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await apiFetch(`/api/spatial/sites/${siteSlug}/layers/${layer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ style }),
      })
      onSaved(style)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 460,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)',
          overflowY: 'auto',
          background: '#15151c',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 18,
          color: '#f0f2f8',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Palette size={16} /> Style — {layer.name}
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: 4,
              background: 'transparent',
              border: 'none',
              color: 'rgba(240,242,248,0.5)',
              cursor: 'pointer',
              lineHeight: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Live preview */}
        <PreviewSwatch
          stroke={stroke}
          fill={fill}
          lineWidth={lineWidth}
          opacity={opacity}
          pointSize={pointSize}
          outline={outline}
          outlineColor={outlineColor}
          layerType={layer.type}
        />

        {/* Stroke / fill */}
        <Section title="Colours">
          <ColorRow label="Stroke" value={stroke} onChange={(v) => patch({ strokeColor: v })} />
          {isVector && (
            <ColorRow label="Fill" value={fill} onChange={(v) => patch({ fillColor: v })} />
          )}
        </Section>

        {/* Geometry knobs */}
        <Section title="Geometry">
          <SliderRow
            label="Line width"
            value={lineWidth}
            min={1}
            max={12}
            step={0.5}
            unit="px"
            onChange={(v) => patch({ lineWidth: v })}
          />
          <SliderRow
            label="Point size"
            value={pointSize}
            min={2}
            max={24}
            step={1}
            unit="px"
            onChange={(v) => patch({ pointSize: v })}
          />
          <SliderRow
            label="Opacity"
            value={Math.round(opacity * 100)}
            min={10}
            max={100}
            step={5}
            unit="%"
            onChange={(v) => patch({ opacity: v / 100 })}
          />
        </Section>

        {/* Outline */}
        <Section title="Outline">
          <CheckRow
            label="Show outline"
            checked={outline}
            onChange={(v) => patch({ outline: v })}
          />
          {outline && (
            <>
              <ColorRow
                label="Outline colour"
                value={outlineColor}
                onChange={(v) => patch({ outlineColor: v })}
              />
              <SliderRow
                label="Outline width"
                value={outlineWidth}
                min={0}
                max={6}
                step={0.5}
                unit="px"
                onChange={(v) => patch({ outlineWidth: v })}
              />
            </>
          )}
        </Section>

        {/* Labels */}
        <Section title="Labels">
          <Field label="Label from attribute">
            <input
              value={labelField}
              onChange={(e) => patch({ labelField: e.target.value })}
              placeholder="e.g. asset_type"
              style={inputStyle}
            />
          </Field>
          {labelField && (
            <>
              <ColorRow
                label="Label colour"
                value={labelColor}
                onChange={(v) => patch({ labelColor: v })}
              />
              <SliderRow
                label="Label size"
                value={labelSize}
                min={9}
                max={24}
                step={1}
                unit="px"
                onChange={(v) => patch({ labelSize: v })}
              />
              <CheckRow
                label="Outline labels"
                checked={labelOutline}
                onChange={(v) => patch({ labelOutline: v })}
              />
            </>
          )}
        </Section>

        {error && (
          <div
            style={{
              padding: 8,
              background: 'rgba(251,113,133,0.08)',
              border: '1px solid rgba(251,113,133,0.32)',
              borderRadius: 7,
              color: '#fca5a5',
              fontSize: 11,
              marginTop: 8,
              marginBottom: 8,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} disabled={saving} style={ghostBtn}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.5 : 1 }}>
            {saving ? <Loader size={12} className="spin" /> : <Check size={12} />}
            {saving ? 'Saving…' : 'Save style'}
          </button>
        </div>
      </div>
    </div>
  )
}

function PreviewSwatch({
  stroke,
  fill,
  lineWidth,
  opacity,
  pointSize,
  outline,
  outlineColor,
  layerType,
}: {
  stroke: string
  fill: string
  lineWidth: number
  opacity: number
  pointSize: number
  outline: boolean
  outlineColor: string
  layerType: string
}) {
  return (
    <div
      style={{
        height: 80,
        background:
          'repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0 8px, transparent 8px 16px), rgba(15,15,20,1)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
        marginBottom: 14,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 460 80" style={{ position: 'absolute', inset: 0 }}>
        {/* Polyline preview */}
        <polyline
          points="20,55 80,30 140,50 200,25 260,45 320,20"
          fill="none"
          stroke={outline ? outlineColor : 'transparent'}
          strokeWidth={lineWidth + (outline ? 2 * Math.max(1, lineWidth * 0.4) : 0)}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
        <polyline
          points="20,55 80,30 140,50 200,25 260,45 320,20"
          fill="none"
          stroke={stroke}
          strokeWidth={lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
        {/* Polygon preview */}
        <polygon
          points="350,25 410,25 440,50 410,65 350,55"
          fill={layerType === 'vector' || layerType === 'geojson' ? fill : 'transparent'}
          stroke={stroke}
          strokeWidth={lineWidth}
          opacity={opacity}
        />
        {/* Point preview */}
        <circle
          cx={170}
          cy={70}
          r={pointSize / 2}
          fill={fill}
          stroke={outline ? outlineColor : stroke}
          strokeWidth={outline ? Math.max(1, lineWidth * 0.4) : 0}
          opacity={opacity}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          top: 6,
          right: 8,
          fontSize: 10,
          color: 'rgba(240,242,248,0.4)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        Preview
      </span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 12 }}>
      <h3
        style={{
          margin: '0 0 6px',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'rgba(240,242,248,0.55)',
        }}
      >
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: 'rgba(240,242,248,0.55)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: 32,
            height: 28,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            padding: 0,
          }}
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, maxWidth: 120, fontFamily: 'monospace' }}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
          {PALETTE.map((p) => (
            <button
              key={p}
              onClick={() => onChange(p)}
              title={p}
              style={{
                width: 18,
                height: 18,
                borderRadius: 4,
                border:
                  value.toLowerCase() === p.toLowerCase()
                    ? '2px solid #f0f2f8'
                    : '1px solid rgba(255,255,255,0.07)',
                background: p,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>
    </Field>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          style={{ flex: 1, accentColor: '#2453ff' }}
        />
        <span
          style={{
            minWidth: 50,
            textAlign: 'right',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#9bb3ff',
          }}
        >
          {value}
          {unit}
        </span>
      </div>
    </Field>
  )
}

function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 6,
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: '#2453ff' }}
      />
      <span style={{ fontSize: 12 }}>{label}</span>
    </label>
  )
}

function numericOr(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  if (typeof value === 'string') {
    const n = parseFloat(value)
    if (!Number.isNaN(n)) return n
  }
  return fallback
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  color: '#f0f2f8',
  fontSize: 12,
  outline: 'none',
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 7,
  color: '#fff',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
}
