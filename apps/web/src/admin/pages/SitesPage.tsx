/** Atlas Sites — Phase T (T+210) rebuild.
 *
 *  Replaces the v1 JSX page that read site.is_public (wrong field) and
 *  expected site.layer_count without the API providing it. Now wired
 *  to the augmented /api/spatial/sites endpoint that returns
 *  is_public_pre_login + layer_count.
 *
 *  Layout: header with search + create, then a card grid (desktop) or
 *  card list (mobile). Each card shows the site initials with the
 *  site's brand colour, name, slug, layer count, public status.
 *
 *  Tap → navigate to the site detail page. Long-press / hover for
 *  quick actions (delete, open in viewer).
 */

import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ExternalLink,
  Eye,
  Globe,
  Layers,
  Loader,
  Lock,
  Package,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { apiFetch, API_URL, useApiData } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'

interface Site {
  id: string
  slug: string
  name: string
  description: string | null
  is_public_pre_login: boolean
  layer_count: number
  primary_color?: string
}

export default function SitesPage() {
  const navigate = useNavigate()
  const { isPhone } = useBreakpoint()
  const { data, loading, error, reload } = useApiData('/api/spatial/sites', [])
  const sites = (data as Site[]) ?? []

  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importErr, setImportErr] = useState<string | null>(null)
  const importInputRef = useRef<HTMLInputElement | null>(null)

  async function handleImportFile(file: File, overwrite: boolean) {
    setImporting(true)
    setImportErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (overwrite) fd.append('overwrite_collision', 'true')
      const token = localStorage.getItem('accessToken')
      const res = await fetch(`${API_URL}/api/spatial/sites/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        let detail = `Import failed (${res.status})`
        try {
          detail = JSON.parse(text)?.detail || detail
        } catch {
          /* keep default */
        }
        if (res.status === 409 && !overwrite) {
          if (
            confirm(
              `${detail}\n\nReplace the existing site with the imported one? This deletes the current site's layers and features.`,
            )
          ) {
            await handleImportFile(file, true)
            return
          }
          throw new Error(detail)
        }
        throw new Error(detail)
      }
      const result = (await res.json()) as { site_slug: string }
      navigate(`/admin/sites/${result.site_slug}`)
    } catch (e) {
      setImportErr((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const filtered = useMemo(() => {
    return sites.filter((s) => {
      if (filter === 'public' && !s.is_public_pre_login) return false
      if (filter === 'private' && s.is_public_pre_login) return false
      const q = search.toLowerCase()
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q)
      )
    })
  }, [sites, search, filter])

  async function deleteSite(s: Site) {
    if (!confirm(`Delete site "${s.name}"? This removes all of its layers.`)) return
    setDeleting(s.id)
    try {
      await apiFetch(`/api/spatial/sites/${s.slug}`, { method: 'DELETE' })
      reload()
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`)
    } finally {
      setDeleting(null)
    }
  }

  const total = sites.length
  const publicCount = sites.filter((s) => s.is_public_pre_login).length

  return (
    <div style={{ padding: isPhone ? 14 : 24, color: '#f0f2f8', paddingBottom: isPhone ? 80 : 24 }}>
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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Sites</h1>
          <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
            {total} site{total === 1 ? '' : 's'} configured · {publicCount} public
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={importInputRef}
            type="file"
            accept=".mtsite,.zip,application/zip"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleImportFile(f, false)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            style={ghostHeaderBtn}
            title="Import a .mtsite package"
          >
            {importing ? <Loader size={14} className="spin" /> : <Package size={14} />}
            {importing ? 'Importing…' : 'Import'}
          </button>
          <button onClick={() => navigate('/admin/sites/new')} style={primaryBtn}>
            <Plus size={14} /> Add site
          </button>
        </div>
      </header>

      {importErr && (
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
          <AlertCircle size={14} />
          <span style={{ flex: 1 }}>Import failed: {importErr}</span>
          <button
            onClick={() => setImportErr(null)}
            style={{
              padding: 4,
              background: 'transparent',
              border: 'none',
              color: 'rgba(240,242,248,0.5)',
              cursor: 'pointer',
              lineHeight: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
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
            placeholder="Search sites…"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f2f8',
              fontSize: 13,
            }}
          />
        </div>
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All
        </FilterChip>
        <FilterChip active={filter === 'public'} onClick={() => setFilter('public')}>
          <Globe size={11} /> Public
        </FilterChip>
        <FilterChip active={filter === 'private'} onClick={() => setFilter('private')}>
          <Lock size={11} /> Private
        </FilterChip>
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
          <AlertCircle size={14} />
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={reload} style={ghostBtn}>
            Retry
          </button>
        </div>
      )}

      {loading && <div style={{ color: 'rgba(240,242,248,0.5)' }}>Loading sites…</div>}

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
          <Globe size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontWeight: 500, color: 'rgba(240,242,248,0.7)' }}>
            {search || filter !== 'all' ? 'No matches' : 'No sites yet'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {search || filter !== 'all'
              ? 'Try a different filter or search term.'
              : 'Create your first site to get started.'}
          </div>
        </div>
      )}

      {/* Card grid */}
      {!loading && filtered.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isPhone
              ? '1fr'
              : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 12,
          }}
        >
          {filtered.map((s) => (
            <SiteCard
              key={s.id}
              site={s}
              deleting={deleting === s.id}
              onOpen={() => navigate(`/admin/sites/${s.slug}`)}
              onDelete={() => deleteSite(s)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SiteCard({
  site,
  deleting,
  onOpen,
  onDelete,
}: {
  site: Site
  deleting: boolean
  onOpen: () => void
  onDelete: () => void
}) {
  return (
    <div
      onClick={onOpen}
      style={{
        position: 'relative',
        padding: 16,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        cursor: 'pointer',
        opacity: deleting ? 0.5 : 1,
        transition: 'transform 120ms, border-color 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'rgba(36,83,255,0.32)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
      }}
    >
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${site.primary_color ?? '#2453ff'}, #a78bfa)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          {site.name.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 14,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {site.name}
          </div>
          <code
            style={{
              fontSize: 11,
              color: 'rgba(240,242,248,0.45)',
              fontFamily: 'monospace',
            }}
          >
            {site.slug}
          </code>
        </div>
      </div>

      {site.description && (
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 12,
            color: 'rgba(240,242,248,0.6)',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {site.description}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 11,
          color: 'rgba(240,242,248,0.55)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Layers size={12} /> {site.layer_count} layer{site.layer_count === 1 ? '' : 's'}
        </span>
        <span>·</span>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color: site.is_public_pre_login ? '#34d399' : 'rgba(240,242,248,0.55)',
          }}
        >
          {site.is_public_pre_login ? <Globe size={12} /> : <Lock size={12} />}
          {site.is_public_pre_login ? 'Public' : 'Private'}
        </span>
      </div>

      {/* Hover row actions */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          display: 'flex',
          gap: 4,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <Link
          to={`/viewer/sites/${site.slug}`}
          target="_blank"
          rel="noreferrer"
          style={iconLink}
          title="Open in viewer"
        >
          <ExternalLink size={12} />
        </Link>
        <button onClick={onDelete} style={iconBtn} title="Delete site">
          <Trash2 size={12} color="#fb7185" />
        </button>
      </div>
    </div>
  )
}

function FilterChip({
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
        padding: '7px 12px',
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

const ghostHeaderBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 8,
  color: '#f0f2f8',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const primaryBtn: React.CSSProperties = {
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
}

const ghostBtn: React.CSSProperties = {
  padding: '4px 10px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  color: '#fca5a5',
  fontSize: 11,
  cursor: 'pointer',
}

const iconBtn: React.CSSProperties = {
  padding: 5,
  background: 'rgba(15,15,20,0.6)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 5,
  color: 'rgba(240,242,248,0.6)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}

const iconLink: React.CSSProperties = {
  ...iconBtn,
  textDecoration: 'none',
}
