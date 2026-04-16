/**
 * MightyTwin — Sketch Layers Panel
 * Layer list with create/rename/delete, colour picker, and preset library.
 */
import { useState } from 'react'
import { Trash2, Plus, Eye, EyeOff, Lock, Unlock } from 'lucide-react'
import type { SketchLayer } from '../types'
import type { LayerPreset } from '../presets/builtinPresets'

interface SketchLayersPanelProps {
  layers: SketchLayer[]
  activeLayerId: string
  onSetActiveLayer: (layerId: string) => void
  onAddLayer: (name: string, colour: string) => void
  onRemoveLayer: (layerId: string) => void
  onRenameLayer: (layerId: string, name: string) => void
  onSetLayerColour: (layerId: string, colour: string) => void
  onToggleVisibility: (layerId: string) => void
  onToggleLock: (layerId: string) => void
  presets: LayerPreset[]
  onLoadPreset: (preset: LayerPreset) => void
}

const QUICK_COLOURS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#84cc16',
  '#eab308', '#f97316', '#ef4444', '#ec4899', '#a855f7',
]

export default function SketchLayersPanel({
  layers,
  activeLayerId,
  onSetActiveLayer,
  onAddLayer,
  onRemoveLayer,
  onRenameLayer,
  onSetLayerColour,
  onToggleVisibility,
  onToggleLock,
  presets,
  onLoadPreset,
}: SketchLayersPanelProps) {
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const startRename = (layer: SketchLayer) => {
    setEditingLayerId(layer.id)
    setEditName(layer.name)
  }

  const commitRename = () => {
    if (editingLayerId && editName.trim()) {
      onRenameLayer(editingLayerId, editName.trim())
    }
    setEditingLayerId(null)
  }

  const handleAdd = () => {
    // Find next unused layer number to avoid duplicate names after deletions
    const usedNums = layers
      .map(l => { const m = l.name.match(/^Layer (\d+)$/); return m ? parseInt(m[1], 10) : 0 })
    const nextNum = Math.max(0, ...usedNums) + 1
    const colour = QUICK_COLOURS[(layers.length) % QUICK_COLOURS.length]
    onAddLayer(`Layer ${nextNum}`, colour)
  }

  const handleDelete = (layerId: string) => {
    if (confirmDelete === layerId) {
      onRemoveLayer(layerId)
      setConfirmDelete(null)
    } else {
      setConfirmDelete(layerId)
    }
  }

  return (
    <div className="sketch-layers-panel">
      {/* Toolbar */}
      <div className="sketch-layers-toolbar">
        <button
          className="sketch-layers-btn"
          onClick={handleAdd}
          title="Add layer"
        >
          <Plus size={14} />
          <span>Add Layer</span>
        </button>
        <button
          className={`sketch-layers-btn${presetsOpen ? ' active' : ''}`}
          onClick={() => setPresetsOpen(p => !p)}
          title="Layer presets"
        >
          <span className="sketch-preset-icon">⟐</span>
          <span>Presets</span>
        </button>
      </div>

      {/* Preset picker */}
      {presetsOpen && (
        <div className="sketch-presets-dropdown">
          <div className="sketch-presets-header">Load preset</div>
          <div className="sketch-presets-list">
            {presets.map(preset => (
              <button
                key={preset.id}
                className="sketch-preset-option"
                onClick={() => { onLoadPreset(preset); setPresetsOpen(false) }}
              >
                <span className="sketch-preset-name">{preset.name}</span>
                <span className="sketch-preset-count">{preset.layers.length} layers</span>
              </button>
            ))}
          </div>
          <p className="sketch-presets-hint">
            Loading a preset replaces all current layers and clears features.
          </p>
        </div>
      )}

      {/* Layer list */}
      <div className="sketch-layer-list">
        {layers.map(layer => (
          <div
            key={layer.id}
            className={`sketch-layer-item${activeLayerId === layer.id ? ' active' : ''}${!layer.visible ? ' hidden-layer' : ''}`}
            onClick={() => onSetActiveLayer(layer.id)}
          >
            {/* Colour swatch (click opens picker) */}
            <label className="sketch-layer-colour-wrap" onClick={e => e.stopPropagation()}>
              <input
                type="color"
                className="sketch-layer-colour-input"
                value={layer.colour}
                onChange={e => onSetLayerColour(layer.id, e.target.value)}
              />
              <span className="sketch-layer-colour-dot" style={{ background: layer.colour }} />
            </label>

            {/* Name (inline editable) */}
            {editingLayerId === layer.id ? (
              <input
                className="sketch-layer-name-edit"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitRename()
                  if (e.key === 'Escape') setEditingLayerId(null)
                }}
                autoFocus
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span
                className="sketch-layer-name"
                onDoubleClick={e => { e.stopPropagation(); startRename(layer) }}
              >
                {layer.name}
              </span>
            )}

            {/* Actions */}
            <div className="sketch-layer-actions" onClick={e => e.stopPropagation()}>
              <button
                className="sketch-layer-action-btn"
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={() => onToggleVisibility(layer.id)}
              >
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                className="sketch-layer-action-btn"
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={() => onToggleLock(layer.id)}
              >
                {layer.locked ? <Lock size={13} /> : <Unlock size={13} />}
              </button>
              {layers.length > 1 && (
                <button
                  className={`sketch-layer-action-btn delete${confirmDelete === layer.id ? ' confirm' : ''}`}
                  title={confirmDelete === layer.id ? 'Click again to confirm' : 'Delete layer'}
                  onClick={() => handleDelete(layer.id)}
                  onBlur={() => setConfirmDelete(null)}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="sketch-layers-hint">
        Double-click a layer name to rename. Active layer receives new features.
      </p>
    </div>
  )
}
