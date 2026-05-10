/**
 * AttributesEditor — minimal port of v1's `<AttributesEditor>` SFC.
 *
 * Renders the schema-driven field rows for a node. Schema resolution
 * walks: per-layer subSchemas[geomKind] → layer.fields → sketch.fields.
 * Each row is a label + typed input that writes back through
 * `useCadEngine.updateNodeAttributes`. Fields flagged `auto:true` are
 * hidden (template-system synthesises them).
 *
 * Free-form keys present on `node.attributes` but missing from the
 * resolved schema are appended as text rows so legacy data stays
 * editable. An "Add field" affordance lets the user stamp ad-hoc keys
 * without opening the schema editor.
 *
 * NOTE: this is a minimal version intentionally — the canonical port
 * (template chips, save-as-template, definition-key auto-templates,
 * pipe canonical fields) lands on `claude/design-tab-sketch`. When that
 * branch merges, drop this file and re-import from there.
 *
 * Spec V1_SPEC.md §5 + §8.
 */
import { useMemo, useState } from 'react'
import { useCadEngine } from '../sketch/useCadEngine'
import type { SchemaField, SketchNode } from '../sketch/types'

interface Props {
  node: SketchNode
}

function geomKindOf(node: SketchNode): 'point' | 'line' | 'polygon' | null {
  const g = node.params.geometry
  if (g === 'point' || g === 'line' || g === 'polygon') return g
  // Solid type-tagged variants render as polygon attribute schemas.
  if (node.type === 'box' || node.type === 'pit' || node.type === 'cylinder') {
    return 'polygon'
  }
  return null
}

/** Walk subSchemas → layer.fields → sketch.fields and produce the
 *  effective field list for this node. Visible-only (auto fields are
 *  filtered out — they are populated by the template system, not edited
 *  by hand). */
function resolveSchema(
  node: SketchNode,
  layerFields: SchemaField[] | undefined,
  layerSubFields: SchemaField[] | undefined,
  sketchFields: SchemaField[],
): SchemaField[] {
  const fields = layerSubFields?.length
    ? layerSubFields
    : layerFields?.length
      ? layerFields
      : sketchFields
  return (fields ?? []).filter(f => !f.auto)
}

export default function AttributesEditor({ node }: Props) {
  const updateNodeAttributes = useCadEngine(s => s.updateNodeAttributes)
  const sketches = useCadEngine(s => s.sketches)
  const sketch = node.params.sketchId ? sketches[node.params.sketchId] : undefined
  const layer = sketch?.layers.find(l => l.id === node.params.sketchLayer)
  const geomKind = geomKindOf(node)

  const fields = useMemo(() => {
    const subFields = geomKind ? layer?.subSchemas?.[geomKind]?.fields : undefined
    return resolveSchema(node, layer?.fields, subFields, sketch?.fields ?? [])
  }, [node, layer, sketch, geomKind])

  // Free-form attributes that aren't covered by the resolved schema —
  // surfaced so users can edit imported / ad-hoc keys.
  const ghostKeys = useMemo(() => {
    const known = new Set(fields.map(f => f.key))
    return Object.keys(node.attributes ?? {}).filter(k => !known.has(k) && !k.startsWith('_'))
  }, [fields, node.attributes])

  const [newKey, setNewKey] = useState('')

  function setAttr(key: string, value: unknown) {
    updateNodeAttributes(node.id, { [key]: value })
  }

  function commitNewKey() {
    const k = newKey.trim()
    if (!k) return
    if (!(k in (node.attributes ?? {}))) {
      updateNodeAttributes(node.id, { [k]: '' })
    }
    setNewKey('')
  }

  if (fields.length === 0 && ghostKeys.length === 0) {
    return (
      <div className="ae">
        <p className="ae-empty">No attributes defined. Add a field below or open the schema editor.</p>
        <div className="ae-tmpl-row">
          <input
            className="ae-save-inp"
            type="text"
            placeholder="New field key (e.g. material)"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitNewKey() }}
          />
          <button type="button" className="ae-add-btn" onClick={commitNewKey} disabled={!newKey.trim()}>
            Add
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="ae">
      <div className="ae-fields">
        {fields.map(f => (
          <FieldRow
            key={f.key}
            field={f}
            value={(node.attributes?.[f.key] ?? f.defaultVal ?? '') as string}
            onChange={v => setAttr(f.key, v)}
          />
        ))}
        {ghostKeys.map(k => (
          <FieldRow
            key={k}
            field={{ key: k, type: 'text' }}
            value={String(node.attributes?.[k] ?? '')}
            onChange={v => setAttr(k, v)}
            ghost
          />
        ))}
      </div>
      <div className="ae-tmpl-row">
        <input
          className="ae-save-inp"
          type="text"
          placeholder="New field key"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitNewKey() }}
        />
        <button type="button" className="ae-add-btn" onClick={commitNewKey} disabled={!newKey.trim()}>
          Add
        </button>
      </div>
    </div>
  )
}

interface FieldRowProps {
  field: Pick<SchemaField, 'key' | 'type'> & { defaultVal?: string }
  value: string
  onChange: (v: string | number | boolean) => void
  ghost?: boolean
}

function FieldRow({ field, value, onChange, ghost = false }: FieldRowProps) {
  const inputId = `ae-${field.key}`
  return (
    <label className="ae-field-row" htmlFor={inputId}>
      <span className="ae-field-lbl" title={ghost ? 'Free-form key (not in schema)' : field.key}>
        {field.key}
      </span>
      {field.type === 'number' ? (
        <input
          id={inputId}
          className="ae-field-inp"
          type="number"
          value={value}
          onChange={e => {
            const v = Number(e.target.value)
            onChange(Number.isFinite(v) ? v : e.target.value)
          }}
        />
      ) : field.type === 'date' ? (
        <input
          id={inputId}
          className="ae-field-inp"
          type="date"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      ) : (
        <input
          id={inputId}
          className="ae-field-inp"
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </label>
  )
}
