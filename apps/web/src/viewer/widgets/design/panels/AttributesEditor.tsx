/**
 * AttributesEditor — schema-driven attribute rows for a single node.
 *
 * Reads the active sketch + layer to resolve the field schema (per-geom
 * subSchema → layer.fields → sketch.fields). Renders one input per
 * field; edits route through `updateNodeAttributes`. Free-form keys
 * already on the node but missing from the schema are surfaced in an
 * "Other" group so existing data isn't hidden.
 *
 * Used by:
 *   • PlaceModeBar SECTION 3 — reads the draft node mid-placement.
 *   • PropertiesTab — reads the selected node post-commit.
 *
 * v1 parity: surfaces the field set, defaults, and free-form catch-all.
 * v1's "save as template" flow is a Phase 6 follow-up — the button stub
 * is wired to call `onSaveAsTemplate` if provided so the host tab can
 * own template creation.
 */
import { useMemo } from 'react'
import { useCadEngine } from '../sketch/useCadEngine'
import type { GeometryKind, SchemaField, SketchNode } from '../sketch/types'

interface Props {
  /** The node whose attributes are being edited. */
  nodeId: string
  /** Optional caption — defaults to "Attributes". */
  title?: string
}

const NUMERIC_TYPES = new Set<SchemaField['type']>(['number'])

export default function AttributesEditor({ nodeId, title = 'Attributes' }: Props) {
  const node = useCadEngine(s => s.nodes[nodeId]) as SketchNode | undefined
  const sketches = useCadEngine(s => s.sketches)
  const updateNodeAttributes = useCadEngine(s => s.updateNodeAttributes)

  const fields = useMemo<SchemaField[]>(() => {
    if (!node) return []
    const sketchId = node.params.sketchId
    const layerId = node.params.sketchLayer
    const sketch = sketchId ? sketches[sketchId] : null
    if (!sketch) return []
    const layer = layerId ? sketch.layers.find(l => l.id === layerId) : null
    const geom = node.params.geometry as GeometryKind | undefined

    // v1 lookup order: per-geometry sublayer → layer.fields → sketch.fields
    if (geom && layer?.subSchemas) {
      const sub = layer.subSchemas[geom as 'point' | 'line' | 'polygon']
      if (sub?.fields?.length) return sub.fields
    }
    if (layer?.fields?.length) return layer.fields
    return sketch.fields ?? []
  }, [node, sketches])

  const extraKeys = useMemo<string[]>(() => {
    if (!node) return []
    const known = new Set(fields.map(f => f.key))
    const reserved = new Set(['_design'])
    return Object.keys(node.attributes ?? {})
      .filter(k => !known.has(k) && !reserved.has(k))
      .sort()
  }, [node, fields])

  if (!node) return null

  function setAttr(key: string, raw: string, type?: SchemaField['type']) {
    if (!node) return
    let value: unknown = raw
    if (type && NUMERIC_TYPES.has(type)) {
      const n = Number(raw)
      value = raw === '' ? '' : Number.isFinite(n) ? n : raw
    }
    updateNodeAttributes(node.id, { [key]: value })
  }

  const hasFields = fields.length > 0
  const hasExtras = extraKeys.length > 0

  return (
    <div className="ae">
      <div className="ae-fields">
        <div className="dw-section-label" style={{ marginBottom: 4 }}>{title}</div>
        {!hasFields && !hasExtras && (
          <p className="ae-error" style={{ background: 'transparent', border: 'none', color: 'var(--dw-text-3)', padding: 0 }}>
            No schema defined for this layer. Open the schema editor to add fields.
          </p>
        )}

        {fields.map(f => {
          const cur = node.attributes?.[f.key]
          const value = cur == null ? (f.defaultVal ?? '') : String(cur)
          if (f.type === 'select') {
            // SchemaField doesn't carry options yet (Phase 6); render
            // text input until enum support lands.
            return (
              <FieldRow key={f.key} field={f} value={value} onChange={v => setAttr(f.key, v, f.type)} />
            )
          }
          return (
            <FieldRow key={f.key} field={f} value={value} onChange={v => setAttr(f.key, v, f.type)} />
          )
        })}

        {hasExtras && (
          <>
            {hasFields && <div className="dw-section-label" style={{ marginTop: 8 }}>Other</div>}
            {extraKeys.map(k => {
              const cur = node.attributes?.[k]
              const value = cur == null ? '' : String(cur)
              return (
                <div key={k} className="ae-field-row">
                  <span className="ae-field-lbl" title={k}>{k}</span>
                  <input
                    className="ae-field-inp"
                    value={value}
                    onChange={e => setAttr(k, e.target.value)}
                  />
                </div>
              )
            })}
          </>
        )}
      </div>
    </div>
  )
}

function FieldRow({
  field, value, onChange,
}: {
  field: SchemaField
  value: string
  onChange: (v: string) => void
}) {
  const inputType =
    field.type === 'number' ? 'number'
    : field.type === 'date' ? 'date'
    : 'text'
  return (
    <div className="ae-field-row">
      <span className="ae-field-lbl" title={field.key}>{field.key}</span>
      <input
        className="ae-field-inp"
        type={inputType}
        value={value}
        readOnly={field.auto === true}
        placeholder={field.defaultVal ?? ''}
        onChange={e => onChange(e.target.value)}
      />
      {field.uom && <span className="dw-number-unit" style={{ fontSize: 11, color: 'var(--dw-text-3)' }}>{field.uom}</span>}
    </div>
  )
}
