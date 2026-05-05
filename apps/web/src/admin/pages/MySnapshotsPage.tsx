/** Atlas — My Snapshots (T+780).
 *
 *  Lists every snapshot the current user has saved, across all sites.
 *  Reads /api/me/snapshots; supports per-snapshot share-to-gallery
 *  toggle, rename, and delete. Click the tile or the Open button to
 *  fly the viewer to the saved camera (uses the T+600 snapshot URL
 *  param).
 *
 *  Filter chips for site (auto-derived from results) and an "All /
 *  Shared / Private" share-state filter.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Camera,
  ExternalLink,
  Image as ImageIcon,
  Loader,
  Lock,
  Pencil,
  Search,
  Share2,
  Trash2,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'

interface Snapshot {
  id: string
  name: string
  description: string | null
  site_slug: string | null
  site_name: string | null
  shared_to_gallery: boolean
  created_at: string | null
  payload?: { thumbnail_url?: string }
}

export default function MySnapshotsPage() {
  const navigate = useNavigate()
  const { isPhone } = useBreakpoint()
  const [snaps, setSnaps] = useState<Snapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [shareFilter, setShareFilter] = useState<'all' | 'shared' | 'private'>('all')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = (await apiFetch('/api/me/snapshots')) as Snapshot[]
      setSnaps(Array.isArray(data) ? data : [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const sites = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of snaps) {
      if (s.site_slug) map.set(s.site_slug, s.site_name ?? s.site_slug)
    }
    return [...map.entries()].map(([slug, name]) => ({ slug, name }))
  }, [snaps])

  const filtered = useMemo(() => {
    return snaps.filter((s) => {
      if (siteFilter !== 'all' && s.site_slug !== siteFilter) return false
      if (shareFilter === 'shared' && !s.shared_to_gallery) return false
      if (shareFilter === 'private' && s.shared_to_gallery) return false
      const q = search.toLowerCase()
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        (s.site_name ?? '').toLowerCase().includes(q)
      )
    })
  }, [snaps, search, siteFilter, shareFilter])

  async function patch(id: string, body: Partial<Snapshot>) {
    try {
      const updated = (await apiFetch(`/api/me/snapshots/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })) as Snapshot
      setSnaps((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)))
    } catch (e) {
      alert((e as Error).message)
    }
  }

  async function deleteSnap(s: Snapshot) {
    if (!confirm(`Delete snap "${s.name}"? This can't be undone.`)) return
    try {
      await apiFetch(`/api/me/snapshots/${s.id}`, { method: 'DELETE' })
      setSnaps((prev) => prev.filter((x) => x.id !== s.id))
    } catch (e) {
      alert((e as Error).message)
    }
  }

  function openInViewer(s: Snapshot) {
    if (!s.site_slug) {
      alert('This snap has no site context — try restoring from the viewer.')
      return
    }
    window.open(
      `/viewer/sites/${s.site_slug}?snapshot=${s.id}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  function startRename(s: Snapshot) {
    setRenaming(s.id)
    setRenameText(s.name)
  }

  async function commitRename(s: Snapshot) {
    const next = renameText.trim()
    setRenaming(null)
    if (!next || next === s.name) return
    await patch(s.id, { name: next })
  }

  return (
    <div
      style={{
        padding: isPhone ? 14 : 24,
        paddingBottom: isPhone ? 80 : 24,
        color: '#f0f2f8',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 16,
          gap: 18,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>My snaps</h1>
          <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
            Saved camera + layer views you've taken — click any tile to fly back.
          </p>
        </div>
      </header>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div
          style={{
            flex: 1,
            minWidth: 220,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
          }}
        >
          <Search size={16} color="rgba(240,242,248,0.4)" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search snaps…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f2f8',
              fontSize: 13,
            }}
          />
          {loading && <Loader size={14} className="spin" />}
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Chip active={siteFilter === 'all'} onClick={() => setSiteFilter('all')}>
          All sites
        </Chip>
        {sites.map((s) => (
          <Chip
            key={s.slug}
            active={siteFilter === s.slug}
            onClick={() => setSiteFilter(s.slug)}
          >
            {s.name}
          </Chip>
        ))}
        <span
          style={{
            width: 1,
            background: 'rgba(255,255,255,0.07)',
            margin: '0 4px',
            alignSelf: 'stretch',
          }}
        />
        <Chip
          active={shareFilter === 'all'}
          onClick={() => setShareFilter('all')}
        >
          All
        </Chip>
        <Chip
          active={shareFilter === 'shared'}
          onClick={() => setShareFilter('shared')}
        >
          <Share2 size={11} /> Shared
        </Chip>
        <Chip
          active={shareFilter === 'private'}
          onClick={() => setShareFilter('private')}
        >
          <Lock size={11} /> Private
        </Chip>
      </div>

      {error && (
        <div
          style={{
            padding: 12,
            background: 'rgba(251,113,133,0.06)',
            border: '1px solid rgba(251,113,133,0.32)',
            borderRadius: 8,
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div
          style={{
            padding: 32,
            textAlign: 'center',
            color: 'rgba(240,242,248,0.5)',
            background: 'rgba(255,255,255,0.03)',
            border: '1px dashed rgba(255,255,255,0.08)',
            borderRadius: 10,
          }}
        >
          <Camera size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontWeight: 500, color: 'rgba(240,242,248,0.7)' }}>
            {snaps.length === 0 ? 'No snaps yet' : 'No matches'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {snaps.length === 0 ? (
              <>Use the Snap tile in the viewer to save your first view.</>
            ) : (
              'Try a different filter or search term.'
            )}
          </div>
          {snaps.length === 0 && (
            <button
              onClick={() => navigate('/viewer')}
              style={{
                marginTop: 14,
                padding: '8px 14px',
                background: '#2453ff',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Camera size={14} /> Open the viewer
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isPhone
              ? 'repeat(2, 1fr)'
              : 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          {filtered.map((s) => (
            <div
              key={s.id}
              style={{
                position: 'relative',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 10,
                overflow: 'hidden',
              }}
            >
              <div
                onClick={() => openInViewer(s)}
                style={{
                  aspectRatio: '4 / 3',
                  background: s.payload?.thumbnail_url
                    ? `center/cover no-repeat url(${s.payload.thumbnail_url})`
                    : 'linear-gradient(135deg, rgba(36,83,255,0.4), rgba(167,139,250,0.4))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                {!s.payload?.thumbnail_url && <ImageIcon size={20} color="#fff" />}
                <div
                  style={{
                    position: 'absolute',
                    top: 6,
                    left: 6,
                    padding: '2px 6px',
                    background: s.shared_to_gallery
                      ? 'rgba(45,212,191,0.18)'
                      : 'rgba(0,0,0,0.5)',
                    borderRadius: 4,
                    color: s.shared_to_gallery ? '#2dd4bf' : '#fff',
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  {s.shared_to_gallery ? (
                    <>
                      <Share2 size={10} /> Shared
                    </>
                  ) : (
                    <>
                      <Lock size={10} /> Private
                    </>
                  )}
                </div>
              </div>
              <div style={{ padding: 10 }}>
                {renaming === s.id ? (
                  <input
                    autoFocus
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => commitRename(s)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(s)
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(36,83,255,0.4)',
                      borderRadius: 5,
                      color: '#f0f2f8',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  />
                ) : (
                  <div
                    onClick={() => startRename(s)}
                    title="Click to rename"
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      cursor: 'text',
                    }}
                  >
                    {s.name}
                  </div>
                )}
                <div
                  style={{
                    fontSize: 10,
                    color: 'rgba(240,242,248,0.45)',
                    marginTop: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {s.site_slug ? (
                    <Link
                      to={`/admin/sites/${encodeURIComponent(s.site_slug)}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ color: 'rgba(167,139,250,0.85)', textDecoration: 'none' }}
                    >
                      {s.site_name ?? s.site_slug}
                    </Link>
                  ) : (
                    'No site'
                  )}
                  {s.created_at && (
                    <>
                      {' · '}
                      {new Date(s.created_at).toLocaleDateString()}
                    </>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  padding: '6px 10px 10px',
                  borderTop: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <button
                  onClick={() => openInViewer(s)}
                  style={iconBtn}
                  title="Open in viewer"
                >
                  <ExternalLink size={11} />
                </button>
                <button
                  onClick={() => startRename(s)}
                  style={iconBtn}
                  title="Rename"
                >
                  <Pencil size={11} />
                </button>
                <button
                  onClick={() =>
                    patch(s.id, { shared_to_gallery: !s.shared_to_gallery })
                  }
                  style={{
                    ...iconBtn,
                    color: s.shared_to_gallery ? '#2dd4bf' : 'rgba(240,242,248,0.7)',
                  }}
                  title={s.shared_to_gallery ? 'Unshare' : 'Share to site gallery'}
                >
                  <Share2 size={11} />
                </button>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => deleteSnap(s)}
                  style={iconBtn}
                  title="Delete snap"
                >
                  <Trash2 size={11} color="#fb7185" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        background: active ? 'rgba(36,83,255,0.18)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${active ? 'rgba(36,83,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 8,
        color: active ? '#9bb3ff' : 'rgba(240,242,248,0.7)',
        fontSize: 12,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {children}
    </button>
  )
}

const iconBtn: React.CSSProperties = {
  padding: 5,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 5,
  color: 'rgba(240,242,248,0.7)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}
