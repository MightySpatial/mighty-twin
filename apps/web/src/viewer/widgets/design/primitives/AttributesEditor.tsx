/**
 * AttributesEditor — template picker + freeform key/value rows + save-as.
 *
 * Drives a single node's `attributes` map. Three concerns in one
 * component (matches v1 `AttributesEditor.vue`):
 *
 *   1. **Template picker dropdown** — flips activeTemplateId, stamps the
 *      template's defaults onto the node's attributes (only for keys
 *      not yet set).
 *   2. **Freeform rows** — every key currently on the node becomes an
 *      editable row; "+ Add field" appends an empty row.
 *   3. **Save-as-template** — snapshot the current attributes + their
 *      keys (typed as text) and POST to /api/sites/{slug}/design-templates.
 *
 * Spec V1_SPEC.md §8.
 */
import { useMemo, useState } from 'react'
import { Trash2, Save } from 'lucide-react'
import { useCadEngine } from '../sketch/useCadEngine'
import {
  useDesignTemplates,
  filterTemplatesByGeometry,
  type DesignTemplate,
} from '../hooks/useDesignTemplates'
import SectionLabel from './SectionLabel'
import type { GeometryKind, SchemaField } from '../sketch/types'

interface Props {
  /** Node whose attributes the editor is bound to. */
  nodeId: string
  /** Site slug — needed to fetch + save templates. When null the picker
   *  + save buttons hide and only the freeform rows render. */
  siteSlug: string | null
  /** Geometry kind used to filter the template picker. Pass the active
   *  tool's geometryType for placement, or the node's params.geometry
   *  for inspection. */
  geometry?: GeometryKind | null
}

export default function AttributesEditor({ nodeId, siteSlug, geometry = null }: Props) {
  const node = useCadEngine(s => s.nodes[nodeId])
  const updateNodeAttributes = useCadEngine(s => s.updateNodeAttributes)
  const replaceNodeAttributes = useCadEngine(s => s.replaceNodeAttributes)
  const activeTemplateId = useCadEngine(s => s.activeTemplateId)
  const setActiveTemplate = useCadEngine(s => s.setActiveTemplate)
  const { templates, saveTemplate, loading } = useDesignTemplates(siteSlug)

  const [savingName, setSavingName] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')

  const visibleTemplates = useMemo(
    () => filterTemplatesByGeometry(templates, geometry),
    [templates, geometry],
  )

  if (!node) return null

  const attrs = node.attributes ?? {}
  const entries = Object.entries(attrs)
  const selectedTemplate = templates.find(t => t.id === (node.template_id ?? activeTemplateId))

  function applyTemplate(tmpl: DesignTemplate | null) {
    if (!tmpl) {
      setActiveTemplate(null)
      return
    }
    setActiveTemplate(tmpl.id)
    // Stamp template defaults onto the node — only for keys the user
    // hasn't already set, so explicit edits win over template values.
    const next: Record<string, unknown> = { ...attrs }
    for (const f of tmpl.fields) {
      if (f.defaultVal !== undefined && next[f.key] === undefined) {
        next[f.key] = f.defaultVal
      }
    }
    if (tmpl.values) {
      for (const [k, v] of Object.entries(tmpl.values)) {
        if (next[k] === undefined) next[k] = v
      }
    }
    updateNodeAttributes(nodeId, next)
  }

  function patchValue(key: string, value: string) {
    updateNodeAttributes(nodeId, { ...attrs, [key]: value })
  }

  function removeKey(key: string) {
    const next = { ...attrs }
    delete next[key]
    replaceNodeAttributes(nodeId, next)
  }

  function addRow() {
    const key = newKey.trim()
    if (!key) return
    if (attrs[key] !== undefined) {
      setNewKey('')
      return
    }
    updateNodeAttributes(nodeId, { ...attrs, [key]: '' })
    setNewKey('')
  }

  async function commitSaveAs() {
    if (!siteSlug || !savingName?.trim()) return
    const fields: SchemaField[] = entries.map(([k]) => ({
      key: k,
      type: 'text',
    }))
    const values: Record<string, unknown> = {}
    for (const [k, v] of entries) values[k] = v
    const tmpl = await saveTemplate({
      name: savingName.trim(),
      geometry: geometry && geometry !== 'other' ? geometry : undefined,
      fields,
      values,
    })
    if (tmpl) {
      setActiveTemplate(tmpl.id)
      setSavingName(null)
    }
  }

  return (
    <div className="dw-attrs-editor">
      {/* Template picker */}
      {siteSlug && (
        <div className="dw-row dw-row--select">
          <SectionLabel>Template</SectionLabel>
          <div className="dw-attrs-template-row">
            <select
              className="dw-select"
              value={selectedTemplate?.id ?? ''}
              disabled={loading}
              onChange={e => {
                const id = e.target.value || null
                applyTemplate(id ? (templates.find(t => t.id === id) ?? null) : null)
              }}
              aria-label="Attribute template"
            >
              <option value="">— None —</option>
              {visibleTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {savingName === null ? (
              <button
                type="button"
                className="dw-attrs-save-btn"
                title="Save current attributes as a template"
                onClick={() => setSavingName('')}
              >
                <Save size={12} /> Save as
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Save-as inline form */}
      {savingName !== null && siteSlug && (
        <div className="dw-attrs-save-form">
          <input
            type="text"
            className="dw-number-input"
            placeholder="Template name"
            value={savingName}
            onChange={e => setSavingName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') commitSaveAs()
              if (e.key === 'Escape') setSavingName(null)
            }}
            autoFocus
          />
          <button
            type="button"
            className="dw-attrs-save-confirm"
            onClick={commitSaveAs}
            disabled={!savingName.trim()}
          >
            Save
          </button>
          <button
            type="button"
            className="dw-attrs-save-cancel"
            onClick={() => setSavingName(null)}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Freeform key/value rows */}
      {entries.length > 0 && (
        <div className="dw-attrs-rows">
          {entries.map(([k, v]) => (
            <div className="dw-attrs-row" key={k}>
              <span className="dw-attrs-key" title={k}>{k}</span>
              <input
                type="text"
                className="dw-number-input dw-attrs-value"
                value={String(v ?? '')}
                onChange={e => patchValue(k, e.target.value)}
                aria-label={k}
              />
              <button
                type="button"
                className="dw-attrs-row-del"
                title={`Remove ${k}`}
                onClick={() => removeKey(k)}
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new key */}
      <div className="dw-attrs-add">
        <input
          type="text"
          className="dw-number-input"
          placeholder="+ field name"
          value={newKey}
          onChange={e => setNewKey(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addRow() }}
          aria-label="Add attribute key"
        />
        <button
          type="button"
          className="dw-attrs-add-btn"
          disabled={!newKey.trim()}
          onClick={addRow}
        >
          Add
        </button>
      </div>
    </div>
  )
}
