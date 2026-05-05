/** FeatureAttributesDrawer — full-attribute side drawer + edit mode (T+1050).
 *
 *  Slides in from the right on desktop / tablet, takes the bottom 80%
 *  of the viewport on phone. Renders every attribute as a key-value
 *  row, copy-on-click, and a search box to filter rows.
 *
 *  Edit mode (when a site slug + database UUID id are available)
 *  swaps key/value rows for editable inputs, lets users add new
 *  attribute keys, delete rows, and save via PATCH /api/spatial/
 *  sites/{slug}/features/{id}. Cancel reverts to the original bag.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  Copy,
  Loader,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { PickedFeature } from './useFeatureClick'

const API_URL = import.meta.env.VITE_API_URL || ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Props {
  picked: PickedFeature
  isMobile: boolean
  /** Site slug — required for edit + delete. When omitted the drawer
   *  stays read-only (e.g. on the public viewer). */
  siteSlug?: string | null
  /** Disable edit mode even when siteSlug is set (e.g. viewer role). */
  readOnly?: boolean
  onClose: () => void
  onZoomTo?: () => void
  /** Called after a successful PATCH so the host can re-fetch and
   *  refresh the picked feature (or remove it after a delete). */
  onChanged?: (next: { properties: Record<string, unknown> } | null) => void
}

type DraftEntry = { key: string; value: string; deleted?: boolean }

export default function FeatureAttributesDrawer({
  picked,
  isMobile,
  siteSlug,
  readOnly = false,
  onClose,
  onZoomTo,
  onChanged,
}: Props) {
  const featureId = picked.id
  const isEditable = !!(siteSlug && !readOnly && UUID_RE.test(featureId))

  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DraftEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // ESC closes — but only when not editing (editing has its own cancel)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editing])

  const allRows = useMemo(
    () =>
      Object.entries(picked.attributes).filter(
        ([, v]) => v != null && (typeof v !== 'string' || v !== ''),
      ),
    [picked.attributes],
  )
  const rows = useMemo(() => {
    if (!search) return allRows
    const q = search.toLowerCase()
    return allRows.filter(
      ([k, v]) =>
        k.toLowerCase().includes(q) || String(v).toLowerCase().includes(q),
    )
  }, [allRows, search])

  function copy(value: unknown) {
    const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
    navigator.clipboard?.writeText(s).then(
      () => {
        setCopied(s)
        setTimeout(() => setCopied(null), 1400)
      },
      () => undefined,
    )
  }

  function startEdit() {
    setDraft(
      Object.entries(picked.attributes).map(([k, v]) => ({
        key: k,
        value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
      })),
    )
    setErr(null)
    setEditing(true)
  }

  function cancelEdit() {
    setDraft([])
    setErr(null)
    setEditing(false)
  }

  async function saveEdit() {
    if (!siteSlug) return
    // Build properties bag from non-deleted rows; coerce numeric/bool
    // strings back to native types so the JSONB column doesn't fill
    // with stringified scalars.
    const props: Record<string, unknown> = {}
    const seenKeys = new Set<string>()
    for (const row of draft) {
      if (row.deleted) continue
      const k = row.key.trim()
      if (!k) continue
      if (seenKeys.has(k)) {
        setErr(`Duplicate key "${k}"`)
        return
      }
      seenKeys.add(k)
      props[k] = coerce(row.value)
    }
    setBusy(true)
    setErr(null)
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(
        `${API_URL}/api/spatial/sites/${siteSlug}/features/${featureId}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            properties: props,
            replace_properties: true,
          }),
        },
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        let msg = `Save failed (${res.status})`
        try {
          msg = JSON.parse(body)?.detail || msg
        } catch {
          /* keep default */
        }
        throw new Error(msg)
      }
      const updated = (await res.json()) as { properties: Record<string, unknown> }
      onChanged?.({ properties: updated.properties || {} })
      setEditing(false)
      setDraft([])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function deleteFeature() {
    if (!siteSlug) return
    if (!confirm('Delete this feature? This can\'t be undone.')) return
    setBusy(true)
    setErr(null)
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(
        `${API_URL}/api/spatial/sites/${siteSlug}/features/${featureId}`,
        {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      )
      if (!res.ok && res.status !== 204) {
        throw new Error(`Delete failed (${res.status})`)
      }
      onChanged?.(null)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const drawerStyle: React.CSSProperties = isMobile
    ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        height: '80vh',
        zIndex: 60,
        background: 'rgba(15,15,20,0.98)',
        backdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        animation: 'fpdSlideUp 220ms ease-out',
      }
    : {
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: 380,
        zIndex: 60,
        background: 'rgba(15,15,20,0.98)',
        backdropFilter: 'blur(16px)',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '-12px 0 30px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fpdSlideRight 220ms ease-out',
      }

  return (
    <>
      <style>{`
        @keyframes fpdSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fpdSlideRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      {isMobile && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 59,
            animation: 'fpdSlideUp 180ms ease-out',
          }}
        />
      )}
      <div style={drawerStyle}>
        {/* Header */}
        <div
          style={{
            padding: 16,
            borderBottom: '1px solid rgba(255,255,255,0.07)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#f0f2f8',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {picked.name}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'rgba(240,242,248,0.45)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginTop: 4,
              }}
            >
              {picked.source ?? 'Feature'} ·{' '}
              {editing ? draft.filter((r) => !r.deleted).length : allRows.length}{' '}
              attribute
              {(editing ? draft.filter((r) => !r.deleted).length : allRows.length) === 1
                ? ''
                : 's'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: 6,
              background: 'transparent',
              border: 'none',
              color: 'rgba(240,242,248,0.6)',
              cursor: 'pointer',
              lineHeight: 0,
            }}
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Action row */}
        {(onZoomTo || isEditable) && !editing && (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            {onZoomTo && (
              <button
                onClick={onZoomTo}
                style={{
                  padding: '6px 10px',
                  background: 'rgba(45,212,191,0.10)',
                  border: '1px solid rgba(45,212,191,0.32)',
                  borderRadius: 6,
                  color: '#2dd4bf',
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <MapPin size={12} /> Zoom to feature
              </button>
            )}
            {isEditable && (
              <>
                <button
                  onClick={startEdit}
                  style={{
                    padding: '6px 10px',
                    background: 'rgba(36,83,255,0.12)',
                    border: '1px solid rgba(36,83,255,0.32)',
                    borderRadius: 6,
                    color: '#9bb3ff',
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Pencil size={12} /> Edit attributes
                </button>
                <button
                  onClick={deleteFeature}
                  disabled={busy}
                  style={{
                    padding: '6px 10px',
                    background: 'rgba(251,113,133,0.10)',
                    border: '1px solid rgba(251,113,133,0.32)',
                    borderRadius: 6,
                    color: '#fb7185',
                    fontSize: 11,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginLeft: 'auto',
                  }}
                >
                  <Trash2 size={12} /> Delete feature
                </button>
              </>
            )}
          </div>
        )}

        {/* Edit-mode action bar */}
        {editing && (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <button
              onClick={() => setDraft((d) => [...d, { key: '', value: '' }])}
              style={{
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6,
                color: '#f0f2f8',
                fontSize: 11,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={12} /> Add attribute
            </button>
            <div style={{ flex: 1 }} />
            <button
              onClick={cancelEdit}
              disabled={busy}
              style={{
                padding: '6px 10px',
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 6,
                color: 'rgba(240,242,248,0.7)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={saveEdit}
              disabled={busy}
              style={{
                padding: '6px 12px',
                background: '#2453ff',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? <Loader size={12} className="spin" /> : <Check size={12} />}
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}

        {err && (
          <div
            style={{
              padding: '8px 16px',
              background: 'rgba(251,113,133,0.06)',
              borderBottom: '1px solid rgba(251,113,133,0.32)',
              color: '#fca5a5',
              fontSize: 11,
            }}
          >
            {err}
          </div>
        )}

        {/* Search (read-only) */}
        {!editing && allRows.length > 4 && (
          <div
            style={{
              padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 6,
              }}
            >
              <Search size={12} color="rgba(240,242,248,0.4)" />
              <input
                type="text"
                placeholder="Filter attributes…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#f0f2f8',
                  fontSize: 12,
                }}
              />
            </div>
          </div>
        )}

        {/* Rows */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 8,
          }}
        >
          {editing ? (
            draft.map((row, i) => (
              <EditRow
                key={i}
                row={row}
                onKey={(k) =>
                  setDraft((d) => d.map((x, j) => (j === i ? { ...x, key: k } : x)))
                }
                onValue={(v) =>
                  setDraft((d) => d.map((x, j) => (j === i ? { ...x, value: v } : x)))
                }
                onDelete={() =>
                  setDraft((d) =>
                    d.map((x, j) => (j === i ? { ...x, deleted: !x.deleted } : x)),
                  )
                }
              />
            ))
          ) : rows.length === 0 ? (
            <div
              style={{
                padding: 32,
                textAlign: 'center',
                color: 'rgba(240,242,248,0.4)',
                fontSize: 12,
              }}
            >
              {search ? 'No matches' : 'No attributes on this feature'}
            </div>
          ) : (
            rows.map(([k, v]) => (
              <Row key={k} label={k} value={v} onCopy={() => copy(v)} />
            ))
          )}
        </div>

        {/* Copied toast */}
        {copied && (
          <div
            style={{
              position: 'absolute',
              bottom: 14,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '6px 14px',
              background: 'rgba(45,212,191,0.16)',
              border: '1px solid rgba(45,212,191,0.32)',
              borderRadius: 999,
              color: '#2dd4bf',
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Copied
          </div>
        )}
      </div>
    </>
  )
}

function Row({
  label,
  value,
  onCopy,
}: {
  label: string
  value: unknown
  onCopy: () => void
}) {
  const display = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  return (
    <div
      style={{
        padding: '10px 12px',
        margin: '0 4px 4px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 6,
        cursor: 'pointer',
      }}
      onClick={onCopy}
      title="Click to copy"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'rgba(240,242,248,0.45)',
          }}
        >
          {label}
        </span>
        <Copy size={11} color="rgba(240,242,248,0.3)" />
      </div>
      <div
        style={{
          fontSize: 12,
          color: '#f0f2f8',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
        }}
      >
        {display}
      </div>
    </div>
  )
}

function EditRow({
  row,
  onKey,
  onValue,
  onDelete,
}: {
  row: DraftEntry
  onKey: (k: string) => void
  onValue: (v: string) => void
  onDelete: () => void
}) {
  return (
    <div
      style={{
        padding: '8px 10px',
        margin: '0 4px 4px',
        background: row.deleted ? 'rgba(251,113,133,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${row.deleted ? 'rgba(251,113,133,0.32)' : 'rgba(255,255,255,0.05)'}`,
        borderRadius: 6,
        opacity: row.deleted ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
        <input
          value={row.key}
          onChange={(e) => onKey(e.target.value)}
          placeholder="key"
          disabled={row.deleted}
          style={{
            flex: 1,
            padding: '4px 6px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 4,
            color: '#f0f2f8',
            fontSize: 11,
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
        <button
          onClick={onDelete}
          style={{
            padding: 4,
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 4,
            color: row.deleted ? '#fb7185' : 'rgba(240,242,248,0.5)',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
          }}
          title={row.deleted ? 'Undo delete' : 'Delete row'}
        >
          <Trash2 size={11} />
        </button>
      </div>
      <textarea
        value={row.value}
        onChange={(e) => onValue(e.target.value)}
        placeholder="value"
        disabled={row.deleted}
        rows={2}
        style={{
          width: '100%',
          padding: '4px 6px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 4,
          color: '#f0f2f8',
          fontSize: 12,
          outline: 'none',
          boxSizing: 'border-box',
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
    </div>
  )
}

function coerce(raw: string): unknown {
  const s = raw.trim()
  if (s === '') return ''
  const lower = s.toLowerCase()
  if (lower === 'true') return true
  if (lower === 'false') return false
  if (lower === 'null') return null
  // Try JSON for nested values (arrays, objects, numbers)
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      return JSON.parse(s)
    } catch {
      return s
    }
  }
  if (/^-?\d+$/.test(s)) {
    const n = parseInt(s, 10)
    if (Number.isSafeInteger(n)) return n
  }
  if (/^-?\d*\.\d+$/.test(s) || /^-?\d+(\.\d+)?[eE][+-]?\d+$/.test(s)) {
    const n = parseFloat(s)
    if (!Number.isNaN(n)) return n
  }
  return raw
}
