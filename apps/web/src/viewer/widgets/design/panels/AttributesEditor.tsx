/**
 * MightyTwin — Attributes Editor (port of v1
 * `design-widget/shared/AttributesEditor.vue`).
 *
 * Renders per-feature attribute key/value editing using the active layer's
 * field schema. Falls back to a freeform "add field" when the layer has no
 * schema. The v1 ⎘ save-as-template button is present but stubbed —
 * persistence requires a backend template registry which the v2 backend
 * doesn't yet expose. The on-disk shape is preserved so the picker lights
 * up the moment the registry endpoint lands.
 *
 * Reserved keys (lon/lat/alt and the geometry param keys) are filtered out
 * of the freeform attribute view because they're driven by the
 * DesignObjectEditor — same separation v1's PropertiesTab observes.
 */
import { useState } from 'react'
import type { SketchFeature, AttributeField } from '../types'

const RESERVED_KEYS = new Set([
  'lon', 'lat', 'alt',
  'width', 'depth', 'height', 'radius',
  'heading', 'pitch', 'roll',
  'wallThickness', 'floorThickness', 'shape', 'refZ',
])

interface Props {
  feature: SketchFeature
  fields: AttributeField[]
  onUpdateAttribute: (featureId: string, key: string, value: unknown) => void
}

export default function AttributesEditor({ feature, fields, onUpdateAttribute }: Props) {
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  const attrs = (feature.attributes ?? {}) as Record<string, unknown>

  // Schema fields: defined on the layer, rendered with type-aware inputs.
  const schemaFields = fields ?? []
  const schemaKeys = new Set(schemaFields.map(f => f.key))

  // Freeform fields: present on the feature but not in schema and not reserved.
  const freeformEntries = Object.entries(attrs).filter(([k]) => !schemaKeys.has(k) && !RESERVED_KEYS.has(k))

  const commitNew = () => {
    const k = newKey.trim()
    if (!k) return
    if (RESERVED_KEYS.has(k)) {
      setNewKey('')
      return
    }
    const num = Number(newVal)
    const value = newVal !== '' && Number.isFinite(num) && /^-?\d/.test(newVal) ? num : newVal
    onUpdateAttribute(feature.id, k, value)
    setNewKey('')
    setNewVal('')
    setAdding(false)
  }

  return (
    <div className="ae">
      {schemaFields.length > 0 && (
        <div className="ae-fields">
          {schemaFields.map(f => (
            <label key={f.id} className="ae-field-row">
              <span className="ae-field-lbl">{f.key}</span>
              {f.type === 'number' ? (
                <input
                  type="number"
                  className="ae-field-inp"
                  value={(attrs[f.key] as number | string | undefined) ?? ''}
                  placeholder={f.defaultVal}
                  onChange={e => onUpdateAttribute(feature.id, f.key, e.target.value === '' ? '' : Number(e.target.value))}
                />
              ) : f.type === 'date' ? (
                <input
                  type="date"
                  className="ae-field-inp"
                  value={(attrs[f.key] as string | undefined) ?? ''}
                  onChange={e => onUpdateAttribute(feature.id, f.key, e.target.value)}
                />
              ) : f.type === 'select' ? (
                <input
                  type="text"
                  className="ae-field-inp"
                  list={`ae-opts-${f.id}`}
                  value={(attrs[f.key] as string | undefined) ?? ''}
                  placeholder={f.defaultVal}
                  onChange={e => onUpdateAttribute(feature.id, f.key, e.target.value)}
                />
              ) : (
                <input
                  type="text"
                  className="ae-field-inp"
                  value={(attrs[f.key] as string | undefined) ?? ''}
                  placeholder={f.defaultVal}
                  onChange={e => onUpdateAttribute(feature.id, f.key, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      )}

      {freeformEntries.length > 0 && (
        <div className="ae-fields">
          {freeformEntries.map(([key, val]) => (
            <label key={key} className="ae-field-row">
              <span className="ae-field-lbl">{key}</span>
              <input
                type="text"
                className="ae-field-inp"
                value={typeof val === 'number' || typeof val === 'string' ? String(val) : ''}
                onChange={e => {
                  const num = Number(e.target.value)
                  const v = e.target.value !== '' && Number.isFinite(num) && /^-?\d/.test(e.target.value) ? num : e.target.value
                  onUpdateAttribute(feature.id, key, v)
                }}
              />
            </label>
          ))}
        </div>
      )}

      {adding ? (
        <div className="ae-save-form">
          <input
            className="ae-save-inp"
            placeholder="Field name"
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
            placeholder="Value"
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
        <button
          type="button"
          className="ae-save-btn ae-add-btn"
          title="Add a freeform attribute to this feature"
          onClick={() => setAdding(true)}
        >+ Attribute</button>
      )}
    </div>
  )
}
