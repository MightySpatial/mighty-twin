/** Edit panel header — feature label (inline-editable), geometry badge,
 *  delete button with two-step confirm. */
import { useState, useEffect } from 'react'
import type { SketchFeature } from '../../types'
import { GEOM_LABELS } from '../editHelpers'

interface Props {
  feature: SketchFeature
  onRename: (id: string, label: string) => void
  onDelete: (id: string) => void
}

export default function FeatureHeader({ feature, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(feature.label)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setDraft(feature.label)
    setEditing(false)
    setConfirmDelete(false)
  }, [feature.id])

  function commit() {
    if (draft.trim() && draft !== feature.label) onRename(feature.id, draft.trim())
    setEditing(false)
  }

  return (
    <div className="edit-feature-header">
      {editing ? (
        <input
          className="edit-label-input"
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <button
          className="edit-label-btn"
          title="Click to rename"
          onClick={() => { setEditing(true); setDraft(feature.label) }}
        >
          {feature.label}
          <span className="edit-label-pencil">✎</span>
        </button>
      )}
      <span className="geometry-badge" data-geom={feature.geometry}>
        {GEOM_LABELS[feature.geometry] ?? feature.geometry}
      </span>
      {!confirmDelete ? (
        <button className="edit-delete-btn" title="Delete feature" onClick={() => setConfirmDelete(true)}>🗑</button>
      ) : (
        <span className="edit-delete-confirm">
          <button className="edit-delete-yes" onClick={() => { onDelete(feature.id); setConfirmDelete(false) }}>Delete</button>
          <button className="edit-delete-no" onClick={() => setConfirmDelete(false)}>Cancel</button>
        </span>
      )}
    </div>
  )
}
