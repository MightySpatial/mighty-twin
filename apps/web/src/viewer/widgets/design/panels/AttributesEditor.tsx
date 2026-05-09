/**
 * MightyTwin — Attributes Editor (port of v1
 * `design-widget/shared/AttributesEditor.vue`).
 *
 * Layout (faithful to v1):
 *   1. Template picker row (when site templates exist)         ⎘ save-as-template
 *   2. Inline save-as-template form (when ⎘ clicked)
 *   3. Schema-driven field rows (active layer's `fields[]`)
 *   4. Freeform attribute rows + "+ Attribute" button
 *
 * The template registry is wired through `useDesignTemplates` →
 * `/api/sites/{slug}/design-templates`. Picking a template applies its
 * `values` map to the feature's attributes; the ⎘ button snapshots the
 * current attributes as a new template owned by the site.
 */
import { useMemo, useState } from 'react'
import type { SketchFeature, AttributeField } from '../types'
import {
  useDesignTemplates,
  type AttributeTemplate,
} from '../hooks/useDesignTemplates'

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
  /** Site slug for the template registry. Pass null when running outside a site
   *  (template picker hides). */
  siteSlug?: string | null
}

const GEOM_TO_TEMPLATE_KIND: Record<string, 'point' | 'line' | 'polygon' | null> = {
  point: 'point',
  line: 'line', traverse: 'line',
  polygon: 'polygon', rectangle: 'polygon', circle: 'polygon',
  box: null, pit: null, cylinder: null,
}

export default function AttributesEditor({
  feature, fields, onUpdateAttribute, siteSlug = null,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')

  const [activeTemplateId, setActiveTemplateId] = useState<string>('')
  const [savingDialog, setSavingDialog] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const geometryFilter = GEOM_TO_TEMPLATE_KIND[feature.geometry] ?? null
  const tmpls = useDesignTemplates({ siteSlug, geometryFilter })

  const attrs = (feature.attributes ?? {}) as Record<string, unknown>
  const schemaFields = fields ?? []
  const schemaKeys = new Set(schemaFields.map(f => f.key))
  const freeformEntries = Object.entries(attrs).filter(([k]) =>
    !schemaKeys.has(k) && !RESERVED_KEYS.has(k))

  const hasAnyValue = useMemo(
    () => Object.values(attrs).some(v => v !== '' && v != null),
    [attrs],
  )

  function applyTemplate(t: AttributeTemplate) {
    if (!t) return
    // Stamp template defaults onto the feature.
    const merged: Record<string, unknown> = {}
    for (const f of t.fields ?? []) {
      if (f.defaultVal != null) merged[f.key] = f.defaultVal
    }
    if (t.values) Object.assign(merged, t.values)
    for (const [k, v] of Object.entries(merged)) {
      if (RESERVED_KEYS.has(k)) continue
      onUpdateAttribute(feature.id, k, v)
    }
  }

  function onTemplateChange(id: string) {
    setActiveTemplateId(id)
    if (!id) return
    const tmpl = tmpls.templates.find(t => t.id === id)
    if (tmpl) applyTemplate(tmpl)
  }

  async function commitSaveDialog() {
    const name = saveName.trim()
    if (!name) return
    setSaveError(null)
    try {
      // Snapshot every populated attribute as a template field + value.
      const fields = Object.entries(attrs)
        .filter(([k, v]) => !RESERVED_KEYS.has(k) && v != null && v !== '')
        .map(([k]) => ({ key: k, type: 'text' as const }))
      const values: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(attrs)) {
        if (!RESERVED_KEYS.has(k) && v != null && v !== '') values[k] = v
      }
      const saved = await tmpls.saveAsTemplate({
        name,
        geometry: geometryFilter ?? undefined,
        fields,
        values,
      })
      if (saved) setActiveTemplateId(saved.id)
      setSavingDialog(false)
      setSaveName('')
    } catch (e) {
      setSaveError((e as Error).message)
    }
  }

  function commitNewFreeform() {
    const k = newKey.trim()
    if (!k || RESERVED_KEYS.has(k)) {
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
      {/* Template picker — only when the site has templates */}
      {siteSlug && tmpls.templates.length > 0 && (
        <div className="ae-tmpl-row">
          <select
            className="ae-tmpl-sel"
            value={activeTemplateId}
            onChange={e => onTemplateChange(e.target.value)}
          >
            <option value="">— Attribute template —</option>
            {tmpls.templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="ae-save-btn"
            disabled={!hasAnyValue}
            title={hasAnyValue
              ? 'Save current attributes as a new template'
              : 'Enter at least one attribute value'}
            onClick={() => setSavingDialog(true)}
          >⎘</button>
        </div>
      )}

      {/* Save-as-template inline dialog */}
      {savingDialog && (
        <div className="ae-save-form">
          <input
            className="ae-save-inp"
            placeholder="Template name"
            value={saveName}
            autoFocus
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitSaveDialog() }
              if (e.key === 'Escape') { setSavingDialog(false); setSaveName('') }
            }}
          />
          <button type="button" className="ae-save-ok" disabled={!saveName.trim()} onClick={commitSaveDialog}>Save</button>
          <button type="button" className="ae-save-cancel" onClick={() => { setSavingDialog(false); setSaveName('') }}>×</button>
        </div>
      )}
      {saveError && <p className="ae-error">{saveError}</p>}

      {/* Schema-driven fields */}
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
                  onChange={e => onUpdateAttribute(feature.id, f.key,
                    e.target.value === '' ? '' : Number(e.target.value))}
                />
              ) : f.type === 'date' ? (
                <input
                  type="date"
                  className="ae-field-inp"
                  value={(attrs[f.key] as string | undefined) ?? ''}
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

      {/* Freeform fields */}
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
                  const v = e.target.value !== '' && Number.isFinite(num) && /^-?\d/.test(e.target.value)
                    ? num : e.target.value
                  onUpdateAttribute(feature.id, key, v)
                }}
              />
            </label>
          ))}
        </div>
      )}

      {/* + Attribute */}
      {adding ? (
        <div className="ae-save-form">
          <input
            className="ae-save-inp"
            placeholder="Field name"
            value={newKey}
            autoFocus
            onChange={e => setNewKey(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitNewFreeform() }
              if (e.key === 'Escape') { setAdding(false); setNewKey(''); setNewVal('') }
            }}
          />
          <input
            className="ae-save-inp"
            placeholder="Value"
            value={newVal}
            onChange={e => setNewVal(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitNewFreeform() }
              if (e.key === 'Escape') { setAdding(false); setNewKey(''); setNewVal('') }
            }}
          />
          <button type="button" className="ae-save-ok" disabled={!newKey.trim()} onClick={commitNewFreeform}>Add</button>
          <button type="button" className="ae-save-cancel" onClick={() => { setAdding(false); setNewKey(''); setNewVal('') }}>×</button>
        </div>
      ) : (
        <button
          type="button"
          className="ae-add-btn"
          title="Add a freeform attribute to this feature"
          onClick={() => setAdding(true)}
        >+ Attribute</button>
      )}
    </div>
  )
}
