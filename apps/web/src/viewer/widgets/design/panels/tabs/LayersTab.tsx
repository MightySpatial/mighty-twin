/**
 * LayersTab — sketch gallery + layer list of the active sketch.
 *
 * v1's LayersTab is the entry point for every sketch session: pick or
 * create a sketch, configure its layers, optionally fork into a redline.
 * v2 keeps that structure: top half is the gallery (one tile per
 * sketch), bottom half is the active sketch's layer list.
 *
 * Redline creation modal lives next door (RedlineCreationModal); the
 * "+ Redline" button opens it.
 */
import { useState } from 'react'
import { Eye, EyeOff, Lock, Plus, Trash2, Unlock } from 'lucide-react'
import { useCadEngine } from '../../sketch/useCadEngine'
import RedlineCreationModal from '../modals/RedlineCreationModal'

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

  const addLayer = useCadEngine(s => s.addLayer)
  const removeLayer = useCadEngine(s => s.removeLayer)
  const renameLayer = useCadEngine(s => s.renameLayer)
  const setLayerColour = useCadEngine(s => s.setLayerColour)
  const toggleLayerVisibility = useCadEngine(s => s.toggleLayerVisibility)
  const toggleLayerLock = useCadEngine(s => s.toggleLayerLock)
  const setActiveLayer = useCadEngine(s => s.setActiveLayer)

  const [editingSketchId, setEditingSketchId] = useState<string | null>(null)
  const [editingSketchName, setEditingSketchName] = useState('')
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editingLayerName, setEditingLayerName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [redlineModalOpen, setRedlineModalOpen] = useState(false)

  const sketchList = Object.values(sketches)
  const activeSketch = activeSketchId ? sketches[activeSketchId] : null

  function startBlankSketch() {
    if (!siteSlug) {
      // Fallback for un-sited demo mode.
      createSketch({ name: `Sketch ${sketchList.length + 1}`, siteId: '__local__' })
      return
    }
    createSketch({ name: `Sketch ${sketchList.length + 1}`, siteId: siteSlug })
  }

  function commitSketchRename() {
    if (editingSketchId && editingSketchName.trim()) {
      renameSketch(editingSketchId, editingSketchName.trim())
    }
    setEditingSketchId(null)
  }

  function commitLayerRename() {
    if (activeSketchId && editingLayerId && editingLayerName.trim()) {
      renameLayer(activeSketchId, editingLayerId, editingLayerName.trim())
    }
    setEditingLayerId(null)
  }

  return (
    <div className="layers-tab">
      {/* ── Sketch gallery ──────────────────────────────────────────── */}
      <div className="layers-tab__hd">Sketches</div>
      <div className="sketch-gallery">
        {sketchList.map(s => {
          const isActive = s.id === activeSketchId
          const isRedline = !!s.redline
          return (
            <div
              key={s.id}
              className={`sketch-tile${isActive ? ' is-active' : ''}${isRedline ? ' is-redline' : ''}`}
              onClick={() => setActiveSketch(s.id)}
            >
              <div className="sketch-tile__title">
                {editingSketchId === s.id ? (
                  <input
                    className="sketch-tile__name-edit"
                    autoFocus
                    value={editingSketchName}
                    onChange={e => setEditingSketchName(e.target.value)}
                    onBlur={commitSketchRename}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitSketchRename()
                      if (e.key === 'Escape') setEditingSketchId(null)
                    }}
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={e => {
                      e.stopPropagation()
                      setEditingSketchId(s.id)
                      setEditingSketchName(s.name)
                    }}
                  >{s.name}</span>
                )}
              </div>
              <div className="sketch-tile__meta">
                {s.layers.length} layer{s.layers.length === 1 ? '' : 's'}
                {isRedline && <span className="sketch-tile__redline-badge">redline</span>}
              </div>
              {isActive && (
                <button
                  className="sketch-tile__del"
                  title="Delete sketch"
                  onClick={e => {
                    e.stopPropagation()
                    if (confirmDelete === s.id) {
                      deleteSketch(s.id)
                      setConfirmDelete(null)
                    } else {
                      setConfirmDelete(s.id)
                    }
                  }}
                >
                  {confirmDelete === s.id ? '✓?' : <Trash2 size={12} />}
                </button>
              )}
            </div>
          )
        })}
        <button className="sketch-tile sketch-tile--add" onClick={startBlankSketch}>
          <Plus size={18} /> Blank sketch
        </button>
        {siteSlug && (
          <button className="sketch-tile sketch-tile--redline" onClick={() => setRedlineModalOpen(true)}>
            ✎ Redline
          </button>
        )}
      </div>

      {/* ── Active sketch's layer list ──────────────────────────────── */}
      {activeSketch && (
        <>
          <div className="layers-tab__hd">Layers · {activeSketch.name}</div>
          <div className="sketch-layer-list">
            {activeSketch.layers.map(layer => {
              const isActive = layer.id === activeLayerId
              return (
                <div
                  key={layer.id}
                  className={`sketch-layer-item${isActive ? ' active' : ''}${!layer.visible ? ' hidden-layer' : ''}`}
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
    </div>
  )
}
