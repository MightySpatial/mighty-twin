/** Atlas — Data sources catalog (T+690 rebuild).
 *
 *  v1 DataPage.jsx referenced fields the backend doesn't return
 *  (ds.size, ds.format, ds.status, ds.feature_count). Rebuilds wires
 *  to the actual /api/spatial/data-sources schema (name, type, url,
 *  size_bytes, attributes) and adds:
 *    - Filter chips per type with live counts
 *    - Storage total in the header subtitle
 *    - URL preview + copy-to-clipboard for each row
 *    - Click row → DataSourcePage detail
 */

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  Box as Box3D,
  Cloud,
  Copy,
  Database,
  FileText,
  Layers as LayersIcon,
  Loader,
  MapIcon,
  MapPin,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { apiFetch, useApiData } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'

interface DataSource {
  id: string
  name: string
  description: string | null
  type: string
  url: string | null
  size_bytes: number | null
  attributes: Record<string, unknown>
  /** Sites this DataSource is used in — joined through Layer on the
   *  server so the catalog can filter without a second round-trip. */
  sites?: { slug: string; name: string }[]
}

type IconCmp = React.ComponentType<{ size?: number | string }>
const TYPE_META: Record<string, { label: string; icon: IconCmp; tint: string }> = {
  vector: { label: 'Vector', icon: MapPin, tint: '#34d399' },
  raster: { label: 'Raster', icon: MapIcon, tint: '#a78bfa' },
  '3d-tiles': { label: '3D Tiles', icon: Box3D, tint: '#f59e0b' },
  ifc: { label: 'IFC', icon: Box3D, tint: '#fb7185' },
  pointcloud: { label: 'Point Cloud', icon: Cloud, tint: '#2dd4bf' },
  splat: { label: 'Gaussian Splat', icon: Sparkles, tint: '#ec4899' },
  geojson: { label: 'GeoJSON', icon: MapPin, tint: '#34d399' },
  default: { label: 'Other', icon: FileText, tint: '#94a3b8' },
}

function fmtBytes(b: number | null): string {
  if (!b || b <= 0) return '—'
  const u = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let v = b
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

export default function DataPage() {
  const navigate = useNavigate()
  const { isPhone } = useBreakpoint()
  const { data, loading, error, reload } = useApiData('/api/spatial/data-sources', [])
  const sources = (data as DataSource[]) ?? []
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<string>('all')
  const [siteFilter, setSiteFilter] = useState<string>('all')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

  // Distinct sites referenced by any DataSource, for the dropdown.
  // "Unassigned" is a synthetic bucket for DataSources not used in any site
  // (uploaded but never wired into a layer).
  const siteOptions = useMemo(() => {
    const seen = new Map<string, string>()
    let hasUnassigned = false
    for (const s of sources) {
      const sites = s.sites ?? []
      if (sites.length === 0) hasUnassigned = true
      for (const x of sites) seen.set(x.slug, x.name)
    }
    const sorted = Array.from(seen.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([slug, name]) => ({ slug, name }))
    if (hasUnassigned) sorted.push({ slug: '__unassigned__', name: 'Unassigned' })
    return sorted
  }, [sources])

  const counts = useMemo(() => {
    const out: Record<string, number> = { all: sources.length }
    for (const s of sources) out[s.type] = (out[s.type] || 0) + 1
    return out
  }, [sources])

  const filtered = useMemo(() => {
    return sources.filter((s) => {
      if (filter !== 'all' && s.type !== filter) return false
      if (siteFilter !== 'all') {
        const sites = s.sites ?? []
        if (siteFilter === '__unassigned__') {
          if (sites.length > 0) return false
        } else if (!sites.some((x) => x.slug === siteFilter)) {
          return false
        }
      }
      const q = search.toLowerCase()
      if (!q) return true
      return (
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q) ||
        (s.url ?? '').toLowerCase().includes(q)
      )
    })
  }, [sources, search, filter, siteFilter])

  const totalBytes = useMemo(
    () => sources.reduce((sum, s) => sum + (s.size_bytes ?? 0), 0),
    [sources],
  )

  async function deleteSource(s: DataSource) {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return
    setDeleting(s.id)
    try {
      await apiFetch(`/api/spatial/data-sources/${s.id}`, { method: 'DELETE' })
      reload()
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`)
    } finally {
      setDeleting(null)
    }
  }

  function copyUrl(url: string, id: string) {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(id)
        setTimeout(() => setCopied(null), 1200)
      },
      () => undefined,
    )
  }

  const types = Object.keys(counts).filter((k) => k !== 'all')

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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>Data sources</h1>
          <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
            {sources.length} catalogued · {fmtBytes(totalBytes)} total
          </p>
        </div>
        <button onClick={() => navigate('/admin/upload')} style={primaryBtn}>
          <Upload size={14} /> Upload
        </button>
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
            placeholder="Search by name, description, URL…"
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '0 4px 0 12px',
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            minWidth: 180,
          }}
          title="Filter by the site this data is loaded into"
        >
          <MapPin size={14} color="rgba(240,242,248,0.45)" />
          <select
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            style={{
              flex: 1,
              padding: '8px 4px',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f0f2f8',
              fontSize: 12,
              cursor: 'pointer',
              appearance: 'none',
            }}
          >
            <option value="all">All sites</option>
            {siteOptions.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all || 0}>
          <Database size={11} /> All
        </Chip>
        {types.map((t) => {
          const meta = TYPE_META[t] ?? TYPE_META.default
          const Icon = meta.icon
          return (
            <Chip
              key={t}
              active={filter === t}
              onClick={() => setFilter(t)}
              count={counts[t] || 0}
            >
              <Icon size={11} /> {meta.label}
            </Chip>
          )
        })}
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
          <LayersIcon size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontWeight: 500, color: 'rgba(240,242,248,0.7)' }}>
            {search || filter !== 'all' ? 'No matches' : 'No data sources yet'}
          </div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {search || filter !== 'all'
              ? 'Try a different filter or search term.'
              : 'Upload data via the Upload page to get started.'}
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((ds) => {
            const meta = TYPE_META[ds.type] ?? TYPE_META.default
            const Icon = meta.icon
            return (
              <div
                key={ds.id}
                onClick={() => navigate(`/admin/data/${ds.id}`)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  cursor: 'pointer',
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 9,
                    background: meta.tint + '22',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: meta.tint,
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ds.name}</div>
                    {(ds.sites ?? []).slice(0, 3).map((sx) => (
                      <span
                        key={sx.slug}
                        onClick={(e) => {
                          e.stopPropagation()
                          setSiteFilter(sx.slug)
                        }}
                        style={siteBadge}
                        title={`Filter to ${sx.name}`}
                      >
                        <MapPin size={9} /> {sx.name}
                      </span>
                    ))}
                    {(ds.sites?.length ?? 0) > 3 && (
                      <span style={{ fontSize: 10, color: 'rgba(240,242,248,0.5)' }}>
                        +{(ds.sites?.length ?? 0) - 3} more
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'rgba(240,242,248,0.45)',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {meta.label} · {fmtBytes(ds.size_bytes)}
                    {ds.url && (
                      <>
                        {' · '}
                        <code style={{ fontFamily: 'monospace' }}>{ds.url}</code>
                      </>
                    )}
                  </div>
                </div>
                {ds.url && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      copyUrl(ds.url!, ds.id)
                    }}
                    style={iconBtn}
                    title={copied === ds.id ? 'Copied!' : 'Copy URL'}
                  >
                    <Copy size={12} color={copied === ds.id ? '#2dd4bf' : undefined} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteSource(ds)
                  }}
                  disabled={deleting === ds.id}
                  style={iconBtn}
                  title="Delete"
                >
                  {deleting === ds.id ? (
                    <Loader size={12} className="spin" />
                  ) : (
                    <Trash2 size={12} color="#fb7185" />
                  )}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Chip({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
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
        gap: 6,
        fontWeight: 500,
      }}
    >
      {children}
      <span
        style={{
          padding: '0 6px',
          background: active ? 'rgba(36,83,255,0.32)' : 'rgba(255,255,255,0.06)',
          borderRadius: 999,
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {count}
      </span>
    </button>
  )
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
  padding: 6,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  color: 'rgba(240,242,248,0.7)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}

const siteBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '2px 7px',
  background: 'rgba(36,83,255,0.10)',
  border: '1px solid rgba(36,83,255,0.28)',
  borderRadius: 999,
  color: '#9bb3ff',
  fontSize: 10,
  fontWeight: 500,
  cursor: 'pointer',
}
