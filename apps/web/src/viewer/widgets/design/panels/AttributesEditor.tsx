/**
 * AttributesEditor — schema-driven + freeform key/value rows for a node.
 *
 *   • Schema rows: one row per field declared on the active sketch's
 *     fields[] (or the active layer's fields[] when set). Field type
 *     drives the input (text / number / date / select).
 *   • Freeform rows: any attribute that isn't in the schema and isn't
 *     a reserved geometry / position key. User can add new ones via
 *     the "+ Attribute" button.
 *
 *   Reserved keys (lon/lat/alt + the geometry params) are filtered out
 *   of freeform display because they're driven by other UI (Move
 *   section / parameter components).
 */
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useCadEngine } from '../sketch/useCadEngine'
import type { SchemaField } from '../sketch/types'

const RESERVED_KEYS = new Set([
  'lon', 'lat', 'alt',
  'width', 'depth', 'height', 'radius',
  'heading', 'pitch', 'roll',
  'wallThickness', 'floorThickness', 'shape', 'refZ',
  'scale', 'scaleX', 'scaleY', 'scaleZ',
])

interface Props {
  /** Required — node whose attributes we're editing. Component returns
   *  null when there's no node, so callers can mount it unconditionally
   *  and rely on selectedNodeId for visibility. */
  nodeId: string | null
}

export default function AttributesEditor({ nodeId }: Props) {
  const node = useCadEngine(s => (nodeId ? s.nodes[nodeId] ?? null : null))
  const sketches = useCadEngine(s => s.sketches)
  const updateNodeAttributes = useCadEngine(s => s.updateNodeAttributes)

  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  if (!nodeId || !node) return null
  const currentNode = node

  // Resolve the schema — layer override beats sketch default.
  const sketch = currentNode.params.sketchId ? sketches[currentNode.params.sketchId] : null
  const layer = sketch?.layers.find(l => l.id === node.params.sketchLayer)
  const schemaFields: SchemaField[] = layer?.fields?.length
    ? layer.fields
    : (sketch?.fields ?? [])
  const schemaKeys = new Set(schemaFields.map(f => f.key))

  const attrs = currentNode.attributes ?? {}
  const freeform = Object.entries(attrs).filter(
    ([k]) => !schemaKeys.has(k) && !RESERVED_KEYS.has(k) && k !== 'name' && k !== 'label',
  )

  function commitNew() {
    const k = newKey.trim()
    if (!k || RESERVED_KEYS.has(k)) {
      setNewKey('')
      setNewVal('')
      return
    }
    const numVal = Number(newVal)
    const value = newVal !== '' && Number.isFinite(numVal) && /^-?\d/.test(newVal)
      ? numVal
      : newVal
    updateNodeAttributes(currentNode.id, { [k]: value })
    setNewKey('')
    setNewVal('')
    setAdding(false)
  }

  function removeKey(k: string) {
    // The engine's updateNodeAttributes merges. To actually drop a
    // key, set it to undefined — JSON.stringify omits undefined values
    // on save, and the in-memory state hides it from the freeform
    // filter on next render.
    updateNodeAttributes(currentNode.id, { [k]: undefined as unknown })
  }

  return (
    <div className="ae">
      {schemaFields.length > 0 && (
        <div className="ae-fields">
          {schemaFields.map(f => (
            <label key={f.key} className="ae-field-row">
              <span className="ae-field-lbl">{f.key}</span>
              {f.type === 'number' ? (
                <input
                  type="number"
                  className="ae-field-inp"
                  value={(attrs[f.key] as number | string | undefined) ?? ''}
                  placeholder={f.defaultVal ?? ''}
                  onChange={e => updateNodeAttributes(
                    node.id,
                    { [f.key]: e.target.value === '' ? '' : Number(e.target.value) },
                  )}
                />
              ) : f.type === 'date' ? (
                <input
                  type="date"
                  className="ae-field-inp"
                  value={(attrs[f.key] as string | undefined) ?? ''}
                  onChange={e => updateNodeAttributes(node.id, { [f.key]: e.target.value })}
                />
              ) : (
                <input
                  type="text"
                  className="ae-field-inp"
                  value={(attrs[f.key] as string | undefined) ?? ''}
                  placeholder={f.defaultVal ?? ''}
                  onChange={e => updateNodeAttributes(node.id, { [f.key]: e.target.value })}
                />
              )}
            </label>
          ))}
        </div>
      )}

      {freeform.length > 0 && (
        <div className="ae-fields">
          {freeform.map(([k, v]) => (
            <label key={k} className="ae-field-row">
              <span className="ae-field-lbl">{k}</span>
              <input
                type="text"
                className="ae-field-inp"
                value={typeof v === 'number' || typeof v === 'string' ? String(v) : ''}
                onChange={e => {
                  const numVal = Number(e.target.value)
                  const next = e.target.value !== '' && Number.isFinite(numVal) && /^-?\d/.test(e.target.value)
                    ? numVal
                    : e.target.value
                  updateNodeAttributes(currentNode.id, { [k]: next })
                }}
              />
              <button
                type="button"
                className="ae-row-del"
                onClick={() => removeKey(k)}
                title="Remove attribute"
              >
                <Trash2 size={12} />
              </button>
            </label>
          ))}
        </div>
      )}

      {adding ? (
        <div className="ae-save-form">
          <input
            className="ae-save-inp"
            placeholder="key"
            value={newKey}
            autoFocus
            onChange={e => setNewKey(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitNew() }
              if (e.key === 'Escape') { setAdding(false); setNewKey(''); setNewVal('') }
            }}
          />
          <input
            className="ae-save-inp"
            placeholder="value"
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitNew() }
              if (e.key === 'Escape') { setAdding(false); setNewKey(''); setNewVal('') }
            }}
          />
          <button type="button" className="ae-save-ok" disabled={!newKey.trim()} onClick={commitNew}>Add</button>
          <button type="button" className="ae-save-cancel" onClick={() => { setAdding(false); setNewKey(''); setNewVal('') }}>×</button>
        </div>
      ) : (
        <button type="button" className="ae-add-btn" onClick={() => setAdding(true)}>
          + Attribute
        </button>
      )}
    </div>
  )
}
