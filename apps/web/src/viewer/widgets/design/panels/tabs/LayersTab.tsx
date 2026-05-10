/**
 * LayersTab — sketch gallery + layer list of the active sketch.
 *
 * v1's LayersTab is the entry point for every sketch session: pick or
 * create a sketch, configure its layers, optionally fork into a redline.
 * v2 keeps that structure: top half is the gallery (one tile per
 * sketch), bottom half is the active sketch's layer list.
 *
 * Wired here:
 *   • Redline creation modal      (RedlineCreationModal — `Redline` tile)
 *   • Schema editor modal         (SchemaEditorModal     — Sliders btn on
 *                                  each redline layer row, scope='layer')
 *   • Sketch settings popover     (gear icon on every sketch tile —
 *                                  rename / duplicate / set as default /
 *                                  delete with confirmation)
 *   • Preset selector             (Load preset button in the gallery
 *                                  header — fetches the site's
 *                                  /design-templates list and creates a
 *                                  new sketch seeded with the chosen
 *                                  template's fields + colour)
 */
import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  LayoutTemplate,
  Lock,
  Plus,
  Settings,
  Sliders,
  Star,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import { generateNodeId } from '../../sketch/dagOps'
import RedlineCreationModal from '../modals/RedlineCreationModal'
import SchemaEditorModal from '../modals/SchemaEditorModal'
import type { SchemaField, Sketch, SketchLayerSpec } from '../../sketch/types'

const API_URL = ((import.meta as unknown as { env?: { VITE_API_URL?: string } })
  .env?.VITE_API_URL) || ''

interface DesignTemplate {
  id?: string
  name: string
  geometry?: 'point' | 'line' | 'polygon'
  colour?: string
  fields?: SchemaField[]
  values?: Record<string, unknown>
}

interface Props {
  siteSlug?: string | null
}

export default function LayersTab({ siteSlug = null }: Props) {
  const sketches = useCadEngine(s => s.sketches)
  const activeSketchId = useCadEngine(s => s.activeSketchId)
  const activeLayerId = useCadEngine(s => s.activeLayerId)

  const createSketch = useCadEngine(s => s.createSketch)
  const deleteSketch = useCadEngine(s => s.deleteSketch)
  const setActiveSketch = useCadEngine(s => s.setActiveSketch)
  const renameSketch = useCadEngine(s => s.renameSketch)
  const patchSketch = useCadEngine(s => s.patchSketch)

  const addLayer = useCadEngine(s => s.addLayer)
  const removeLayer = useCadEngine(s => s.removeLayer)
  const renameLayer = useCadEngine(s => s.renameLayer)
  const setLayerColour = useCadEngine(s => s.setLayerColour)
  const toggleLayerVisibility = useCadEngine(s => s.toggleLayerVisibility)
  const toggleLayerLock = useCadEngine(s => s.toggleLayerLock)
  const setActiveLayer = useCadEngine(s => s.setActiveLayer)

  const addNode = useCadEngine(s => s.addNode)

  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingLayerName, setEditingLayerName] = useState('')
  const [redlineModalOpen, setRedlineModalOpen] = useState(false)

  // Sketch settings popover — id of the sketch whose gear is open.
  const [popoverSketchId, setPopoverSketchId] = useState<string | null>(null)
  // Inline rename state lives inside the popover (not on the tile).
  const [popoverNameDraft, setPopoverNameDraft] = useState('')
  // Two-step delete confirm inside the popover.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Schema editor modal — the redline layer whose schema is being edited.
  const [schemaEditorLayerId, setSchemaEditorLayerId] = useState<string | null>(null)

  // Preset selector — dropdown open + cached site templates.
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const [templates, setTemplates] = useState<DesignTemplate[]>([])
  const [templatesLoaded, setTemplatesLoaded] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState<string | null>(null)
  const presetMenuRef = useRef<HTMLDivElement | null>(null)

  const sketchList = Object.values(sketches)
  const activeSketch = activeSketchId ? sketches[activeSketchId] : null

  // ── Effects ──────────────────────────────────────────────────────────

  // ESC closes any popover/dropdown.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPopoverSketchId(null)
      setConfirmDeleteId(null)
      setPresetMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Lazy-load templates the first time the preset menu opens.
  useEffect(() => {
    if (!presetMenuOpen || !siteSlug || templatesLoaded || templatesLoading) return
    let cancelled = false
    setTemplatesLoading(true)
    setTemplatesError(null)
    const token = localStorage.getItem('accessToken')
    fetch(`${API_URL}/api/sites/${siteSlug}/design-templates`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => {
        if (!r.ok) throw new Error(`templates ${r.status}`)
        return r.json() as Promise<{ templates?: DesignTemplate[] }>
      })
      .then(data => {
        if (cancelled) return
        setTemplates(data.templates ?? [])
        setTemplatesLoaded(true)
      })
      .catch(e => {
        if (!cancelled) setTemplatesError((e as Error).message)
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false)
      })
    return () => { cancelled = true }
  }, [presetMenuOpen, siteSlug, templatesLoaded, templatesLoading])

  // Click-outside closes the preset dropdown.
  useEffect(() => {
    if (!presetMenuOpen) return
    const onClick = (e: MouseEvent) => {
      const root = presetMenuRef.current
      if (root && e.target instanceof Node && !root.contains(e.target)) {
        setPresetMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [presetMenuOpen])

  // ── Helpers ──────────────────────────────────────────────────────────

  function startBlankSketch() {
    const targetSiteId = siteSlug || '__local__'
    createSketch({ name: `Sketch ${sketchList.length + 1}`, siteId: targetSiteId })
  }

  function commitLayerRename() {
    if (activeSketchId && editingLayerId && editingLayerName.trim()) {
      renameLayer(activeSketchId, editingLayerId, editingLayerName.trim())
    }
    setEditingLayerId(null)
  }

  function openSettingsPopover(sketch: Sketch) {
    setPopoverSketchId(sketch.id)
    setPopoverNameDraft(sketch.name)
    setConfirmDeleteId(null)
  }

  function closeSettingsPopover() {
    setPopoverSketchId(null)
    setConfirmDeleteId(null)
  }

  function commitPopoverRename(sketchId: string) {
    const name = popoverNameDraft.trim()
    if (name) renameSketch(sketchId, name)
  }

  /** Duplicate a sketch — copies metadata, layers (with fresh ids), and
   *  every node pinned to the source sketch (with fresh ids + remapped
   *  layer references). Implemented inline because the engine doesn't
   *  expose a single duplicateSketch action. */
  function duplicateSketch(sourceId: string) {
    const source = useCadEngine.getState().sketches[sourceId]
    if (!source) return

    const targetSiteId = source.siteIds[0] ?? siteSlug ?? '__local__'
    const newId = createSketch({
      name: `${source.name} (copy)`,
      siteId: targetSiteId,
    })

    // createSketch produced one default layer. We rewrite the layer list
    // wholesale — keep the auto-created layer's id as the mapping target
    // for the source's first layer, then call addLayer for the rest.
    const firstNewLayerId = useCadEngine.getState().sketches[newId]?.layers[0]?.id
    if (!firstNewLayerId) return

    const layerMap = new Map<string, string>()

    const newLayers: SketchLayerSpec[] = source.layers.map((srcLayer, idx) => {
      const targetId = idx === 0
        ? firstNewLayerId
        : addLayer(newId, {
            name: srcLayer.name,
            colour: srcLayer.colour,
            visible: srcLayer.visible,
            locked: srcLayer.locked,
            coordMode: srcLayer.coordMode,
          })
      layerMap.set(srcLayer.id, targetId)
      return { ...srcLayer, id: targetId }
    })

    patchSketch(newId, {
      layers: newLayers,
      activeLayerId: newLayers[0]?.id ?? '',
      coordMode: source.coordMode,
      coordCrs: source.coordCrs,
      heightDatum: source.heightDatum,
      localOrigin: { ...source.localOrigin },
      localRotation: source.localRotation,
      fields: source.fields.map(f => ({ ...f })),
    })

    // Copy nodes — fresh ids, sketchId rewritten, sketchLayer remapped.
    const allNodes = useCadEngine.getState().nodes
    const fallbackLayerId = newLayers[0]?.id ?? ''
    for (const node of Object.values(allNodes)) {
      if (node.params.sketchId !== sourceId) continue
      const oldLayerId = node.params.sketchLayer ?? ''
      const newLayerId = layerMap.get(oldLayerId) ?? fallbackLayerId
      addNode({
        ...node,
        id: generateNodeId(),
        params: {
          ...node.params,
          sketchId: newId,
          sketchLayer: newLayerId,
        },
        attributes: { ...node.attributes },
        style: { ...node.style },
      })
    }
  }

  /** "Set as default" — at most one sketch is default per gallery.
   *  Toggling a sketch ON clears the flag on every other. */
  function setAsDefault(sketchId: string) {
    const all = useCadEngine.getState().sketches
    for (const id of Object.keys(all)) {
      const cur = all[id]
      if (id === sketchId) {
        if (!cur.isDefault) patchSketch(id, { isDefault: true })
      } else if (cur.isDefault) {
        patchSketch(id, { isDefault: false })
      }
    }
  }

  /** Apply a template as a "preset sketch" — create a new sketch and
   *  seed its first layer's colour + the sketch-level fields[] from the
   *  template. The user is dropped onto the new sketch immediately. */
  function applyPreset(template: DesignTemplate) {
    const targetSiteId = siteSlug || '__local__'
    const newId = createSketch({
      name: template.name || 'Preset sketch',
      siteId: targetSiteId,
    })
    const fresh = useCadEngine.getState().sketches[newId]
    if (!fresh) return

    const firstLayer = fresh.layers[0]
    const layers = (firstLayer && template.colour)
      ? fresh.layers.map(l => l.id === firstLayer.id ? { ...l, colour: template.colour! } : l)
      : fresh.layers

    patchSketch(newId, {
      layers,
      fields: (template.fields ?? []).map(f => ({ ...f })),
    })
    setPresetMenuOpen(false)
  }

  // ── Render ───────────────────────────────────────────────────────────

  const popoverSketch = popoverSketchId ? sketches[popoverSketchId] : null
  const isRedlineSketch = !!activeSketch?.redline

  return (
    <div className="layers-tab">
      {/* ── Sketch gallery ──────────────────────────────────────────── */}
      <div className="layers-tab__hd-row">
        <div className="layers-tab__hd">Sketches</div>
        {siteSlug && (
          <div className="preset-menu" ref={presetMenuRef}>
            <button
              type="button"
              className="preset-menu__btn"
              onClick={() => setPresetMenuOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={presetMenuOpen}
            >
              <LayoutTemplate size={14} />
              <span>Load preset</span>
              <ChevronDown size={12} />
            </button>
            {presetMenuOpen && (
              <div className="preset-menu__pop" role="menu">
                <div className="preset-menu__hd">Site templates</div>
                {templatesLoading && (
                  <div className="preset-menu__msg">Loading…</div>
                )}
                {templatesError && (
                  <div className="preset-menu__msg preset-menu__msg--err">
                    {templatesError}
                  </div>
                )}
                {!templatesLoading && !templatesError && templates.length === 0 && (
                  <div className="preset-menu__msg">
                    No templates yet. Save one from the Attributes editor
                    to start a library.
                  </div>
                )}
                {!templatesLoading && !templatesError && templates.map((t, i) => (
                  <button
                    key={t.id ?? `tpl-${i}`}
                    type="button"
                    className="preset-menu__item"
                    onClick={() => applyPreset(t)}
                    role="menuitem"
                  >
                    <span
                      className="preset-menu__dot"
                      style={t.colour ? { background: t.colour } : undefined}
                    />
                    <span className="preset-menu__name">{t.name}</span>
                    <span className="preset-menu__meta">
                      {t.geometry ?? 'any'} · {t.fields?.length ?? 0} fields
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="sketch-gallery">
        {sketchList.map(s => {
          const isActive = s.id === activeSketchId
          const isRedline = !!s.redline
          const isDefault = !!s.isDefault
          const popoverOpen = popoverSketchId === s.id
          return (
            <div
              key={s.id}
              className={`sketch-tile${isActive ? ' is-active' : ''}${isRedline ? ' is-redline' : ''}${isDefault ? ' is-default' : ''}`}
              onClick={() => setActiveSketch(s.id)}
            >
              <div className="sketch-tile__title">
                <span className="sketch-tile__name">{s.name}</span>
                {isDefault && (
                  <span className="sketch-tile__default-badge" title="Default sketch">
                    <Star size={9} fill="currentColor" />
                    Default
                  </span>
                )}
              </div>
              <div className="sketch-tile__meta">
                {s.layers.length} layer{s.layers.length === 1 ? '' : 's'}
                {isRedline && <span className="sketch-tile__redline-badge">redline</span>}
              </div>

              <button
                className="sketch-tile__settings"
                title="Sketch settings"
                aria-label="Sketch settings"
                aria-haspopup="menu"
                aria-expanded={popoverOpen}
                onClick={e => {
                  e.stopPropagation()
                  if (popoverOpen) closeSettingsPopover()
                  else openSettingsPopover(s)
                }}
              >
                <Settings size={14} />
              </button>

              {popoverOpen && popoverSketch && (
                <div
                  className="sketch-popover"
                  role="menu"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="sketch-popover__hd">
                    <span>Sketch settings</span>
                    <button
                      type="button"
                      className="sketch-popover__close"
                      title="Close"
                      aria-label="Close"
                      onClick={closeSettingsPopover}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <label className="sketch-popover__field">
                    <span className="sketch-popover__field-label">Name</span>
                    <input
                      autoFocus
                      className="sketch-popover__input"
                      value={popoverNameDraft}
                      onChange={e => setPopoverNameDraft(e.target.value)}
                      onBlur={() => commitPopoverRename(popoverSketch.id)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          commitPopoverRename(popoverSketch.id)
                          closeSettingsPopover()
                        }
                      }}
                    />
                  </label>

                  <button
                    type="button"
                    className="sketch-popover__item"
                    onClick={() => {
                      duplicateSketch(popoverSketch.id)
                      closeSettingsPopover()
                    }}
                  >
                    <Copy size={14} />
                    <span>Duplicate sketch</span>
                  </button>

                  <button
                    type="button"
                    className={`sketch-popover__item${popoverSketch.isDefault ? ' is-on' : ''}`}
                    onClick={() => {
                      setAsDefault(popoverSketch.id)
                      closeSettingsPopover()
                    }}
                    disabled={popoverSketch.isDefault}
                  >
                    <Star size={14} fill={popoverSketch.isDefault ? 'currentColor' : 'none'} />
                    <span>{popoverSketch.isDefault ? 'Default sketch' : 'Set as default'}</span>
                  </button>

                  <div className="sketch-popover__sep" />

                  {confirmDeleteId === popoverSketch.id ? (
                    <div className="sketch-popover__confirm-row">
                      <button
                        type="button"
                        className="sketch-popover__confirm-yes"
                        onClick={() => {
                          deleteSketch(popoverSketch.id)
                          setConfirmDeleteId(null)
                          setPopoverSketchId(null)
                        }}
                      >
                        Delete permanently
                      </button>
                      <button
                        type="button"
                        className="sketch-popover__confirm-no"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="sketch-popover__item sketch-popover__item--danger"
                      onClick={() => setConfirmDeleteId(popoverSketch.id)}
                    >
                      <Trash2 size={14} />
                      <span>Delete sketch</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <button className="sketch-tile sketch-tile--add" onClick={startBlankSketch}>
          <Plus size={18} /> Blank sketch
        </button>
        {siteSlug && (
          <button className="sketch-tile sketch-tile--redline" onClick={() => setRedlineModalOpen(true)}>
            Redline
          </button>
        )}
      </div>

      {/* ── Active sketch's layer list ──────────────────────────────── */}
      {activeSketch && (
        <>
          <div className="layers-tab__hd">Layers · {activeSketch.name}</div>
          <div className="sketch-layer-list">
            {activeSketch.layers.map(layer => {
              const isLayerActive = layer.id === activeLayerId
              return (
                <div
                  key={layer.id}
                  className={`sketch-layer-item${isLayerActive ? ' active' : ''}${!layer.visible ? ' hidden-layer' : ''}`}
                  onClick={() => setActiveLayer(layer.id)}
                >
                  <label className="sketch-layer-colour-wrap" onClick={e => e.stopPropagation()}>
                    <input
                      type="color"
                      className="sketch-layer-colour-input"
                      value={layer.colour}
                      onChange={e => setLayerColour(activeSketch.id, layer.id, e.target.value)}
                    />
                    <span className="sketch-layer-colour-dot" style={{ background: layer.colour }} />
                  </label>

                  {editingLayerId === layer.id ? (
                    <input
                      className="sketch-layer-name-edit"
                      autoFocus
                      value={editingLayerName}
                      onChange={e => setEditingLayerName(e.target.value)}
                      onBlur={commitLayerRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitLayerRename()
                        if (e.key === 'Escape') setEditingLayerId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span
                      className="sketch-layer-name"
                      onDoubleClick={e => {
                        e.stopPropagation()
                        setEditingLayerId(layer.id)
                        setEditingLayerName(layer.name)
                      }}
                    >{layer.name}</span>
                  )}

                  <div className="sketch-layer-actions" onClick={e => e.stopPropagation()}>
                    {/* Schema editor — only redline sketches edit a schema
                        (freeform sketches don't promote, so the column
                        contract doesn't apply). */}
                    {isRedlineSketch && (
                      <button
                        className="sketch-layer-action-btn"
                        title="Edit layer schema"
                        aria-label="Edit layer schema"
                        onClick={() => setSchemaEditorLayerId(layer.id)}
                      >
                        <Sliders size={13} />
                      </button>
                    )}
                    <button
                      className="sketch-layer-action-btn"
                      title={layer.visible ? 'Hide layer' : 'Show layer'}
                      onClick={() => toggleLayerVisibility(activeSketch.id, layer.id)}
                    >
                      {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button
                      className="sketch-layer-action-btn"
                      title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                      onClick={() => toggleLayerLock(activeSketch.id, layer.id)}
                    >
                      {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                    {activeSketch.layers.length > 1 && (
                      <button
                        className="sketch-layer-action-btn delete"
                        title="Delete layer"
                        onClick={() => removeLayer(activeSketch.id, layer.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <button
            className="sketch-layers-btn"
            onClick={() => addLayer(activeSketch.id)}
            style={{ marginTop: 8 }}
          >
            <Plus size={14} /> <span>Add Layer</span>
          </button>
        </>
      )}

      {redlineModalOpen && siteSlug && (
        <RedlineCreationModal
          siteSlug={siteSlug}
          onClose={() => setRedlineModalOpen(false)}
        />
      )}

      {schemaEditorLayerId && (
        <SchemaEditorModal
          initialScope="layer"
          layerId={schemaEditorLayerId}
          onClose={() => setSchemaEditorLayerId(null)}
        />
      )}
    </div>
  )
}
