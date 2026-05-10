/**
 * SchemaEditorModal — sketch / layer / object scope.
 *
 * Edits the schema (list of attribute fields) at one of three
 * granularities:
 *
 *   sketch — Sketch.fields[]              (default for every layer +
 *                                          every object on that sketch)
 *   layer  — SketchLayerSpec.fields[]     (override for one layer; can
 *                                          also carry per-geometry
 *                                          subSchemas in redlines, but
 *                                          this v2 modal edits the
 *                                          shared list — the per-geom
 *                                          tabs are queued for
 *                                          follow-up.)
 *   object — Node.attributes              (one-off keys for a single
 *                                          node, no schema change)
 *
 * Spec V1_SPEC.md §5 + §6 §3 attributes editor.
 */
import { useState } from 'react'
import { Trash2, Plus } from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import SectionLabel from '../../primitives/SectionLabel'
import SelectRow from '../../primitives/SelectRow'
import type { SchemaField } from '../../sketch/types'

type Scope = 'sketch' | 'layer' | 'object'

interface Props {
  /** Initial scope. The Sketch tab opens 'sketch'; Layers tab opens
   *  'layer'; Properties tab opens 'object'. */
  initialScope: Scope
  /** Required when scope === 'layer' or 'object'. */
  layerId?: string
  objectId?: string
  onClose: () => void
}

const FIELD_TYPES = [
  { value: 'text' as const,   label: 'Text' },
  { value: 'number' as const, label: 'Number' },
  { value: 'date' as const,   label: 'Date' },
  { value: 'select' as const, label: 'Select' },
]

export default function SchemaEditorModal({ initialScope, layerId, objectId, onClose }: Props) {
  const [scope, setScope] = useState<Scope>(initialScope)
  const sketches = useCadEngine(s => s.sketches)
  const nodes = useCadEngine(s => s.nodes)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const patchSketch = useCadEngine(s => s.patchSketch)
  const updateNodeAttributes = useCadEngine(s => s.updateNodeAttributes)

  const sketch = activeSketchId ? sketches[activeSketchId] : null
  if (!sketch) return null

  // Pull whichever field list applies for the current scope.
  const layer = layerId ? sketch.layers.find(l => l.id === layerId) : null
  const node = objectId ? nodes[objectId] : null

  const fields: SchemaField[] = scope === 'sketch'
    ? (sketch.fields ?? [])
    : scope === 'layer'
      ? (layer?.fields ?? sketch.fields ?? [])
      : Object.entries(node?.attributes ?? {}).map(([k, v]) => ({
          key: k,
          type: typeof v === 'number' ? ('number' as const)
              : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? ('date' as const)
              : ('text' as const),
          defaultVal: v == null ? '' : String(v),
        }))

  function patchFields(next: SchemaField[]) {
    if (scope === 'sketch') {
      patchSketch(sketch!.id, { fields: next, _schemaModified: true })
      return
    }
    if (scope === 'layer' && layer) {
      const layers = sketch!.layers.map(l => l.id === layer.id ? { ...l, fields: next } : l)
      patchSketch(sketch!.id, { layers })
      return
    }
    if (scope === 'object' && node) {
      // For object scope, each "field" maps to a key/default pair on the
      // node's own attributes.
      const attrs: Record<string, unknown> = {}
      for (const f of next) attrs[f.key] = f.defaultVal ?? ''
      updateNodeAttributes(node.id, attrs)
    }
  }

  function addField() {
    patchFields([...fields, { key: `field_${fields.length + 1}`, type: 'text', defaultVal: '' }])
  }

  function patchField(i: number, patch: Partial<SchemaField>) {
    patchFields(fields.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  }

  function removeField(i: number) {
    patchFields(fields.filter((_, idx) => idx !== i))
  }

  return (
    <div className="dw-modal-backdrop" onClick={onClose}>
      <div className="dw-modal" onClick={e => e.stopPropagation()}>
        <div className="dw-modal__hd">
          <h3>Schema editor</h3>
          <button className="dw-modal__close" onClick={onClose}>×</button>
        </div>

        <div className="dw-modal__body">
          <SectionLabel>Scope</SectionLabel>
          <div className="dw-toggle dw-toggle--pill">
            {(['sketch', 'layer', 'object'] as Scope[]).map(s => (
              <button
                key={s}
                type="button"
                className={`dw-toggle-btn${scope === s ? ' on' : ''}`}
                onClick={() => setScope(s)}
                disabled={(s === 'layer' && !layer) || (s === 'object' && !node)}
              >
                {s === 'sketch' ? sketch.name
                  : s === 'layer' ? (layer?.name ?? 'Layer')
                  : (node ? `Node ${node.id.slice(-6)}` : 'Object')}
              </button>
            ))}
          </div>

          <SectionLabel>Fields</SectionLabel>
          {fields.length === 0 && (
            <p className="ae-empty">No fields yet. Click + Field below.</p>
          )}
          <div className="ae-fields">
            {fields.map((f, i) => (
              <div key={i} className="schema-field-row">
                <input
                  className="ae-field-inp"
                  value={f.key}
                  placeholder="key"
                  onChange={e => patchField(i, { key: e.target.value })}
                />
                <SelectRow
                  label=""
                  value={f.type}
                  options={FIELD_TYPES}
                  onChange={v => patchField(i, { type: v as SchemaField['type'] })}
                />
                <input
                  className="ae-field-inp"
                  value={f.defaultVal ?? ''}
                  placeholder="default"
                  onChange={e => patchField(i, { defaultVal: e.target.value })}
                />
                <button
                  type="button"
                  className="design-feature-delete"
                  onClick={() => removeField(i)}
                  title="Remove field"
                  style={{ opacity: 1 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>

          <button className="ae-add-btn" onClick={addField}>
            <Plus size={14} /> Field
          </button>
        </div>

        <div className="dw-modal__actions">
          <button className="ae-save-ok" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
