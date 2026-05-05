/** Atlas — Data source detail (T+720 rebuild).
 *
 *  v1 used wrong field names (ds.size, ds.format, ds.status, ds.crs)
 *  and broken styles (site-detail-page CSS deleted in T+180). Rebuild
 *  uses real schema (size_bytes, attributes), retains the AttributeTable
 *  shell, and keeps the "add to site" flow that links data sources to
 *  layers on a site.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  Box as Box3D,
  CheckCircle,
  ChevronLeft,
  Cloud,
  Copy,
  Database,
  FileText,
  Loader,
  MapIcon,
  MapPin,
  Plus,
  Sparkles,
  Table2,
  Trash2,
} from 'lucide-react'
import { AttributeTable } from '@mightydt/ui'
import { apiFetch, useApiData } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useToast } from '../../viewer/hooks/useToast'

interface DataSource {
  id: string
  name: string
  description: string | null
  type: string
  url: string | null
  size_bytes: number | null
  attributes: Record<string, unknown> | unknown[]
}

interface SiteListItem {
  id: string
  slug: string
  name: string
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

const LAYER_TYPES = [
  { value: 'vector', label: 'Vector' },
  { value: 'raster', label: 'Raster' },
  { value: 'terrain', label: 'Terrain' },
  { value: '3d-tiles', label: '3D Tiles' },
  { value: 'wms', label: 'WMS' },
  { value: 'wmts', label: 'WMTS' },
  { value: 'splat', label: 'Splat' },
]

const TYPE_TO_LAYER: Record<string, string> = {
  vector: 'vector',
  raster: 'raster',
  '3d-tiles': '3d-tiles',
  ifc: '3d-tiles',
  pointcloud: 'vector',
  splat: 'splat',
  geojson: 'vector',
}

function fmtBytes(b: number | null): string {
  if (!b || b <= 0) return '—'
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = b
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`
}

export default function DataSourcePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isPhone } = useBreakpoint()
  const { addToast } = useToast()

  const { data: dsData, loading, error } = useApiData(
    id ? `/api/spatial/data-sources/${id}` : null,
    null,
  )
  const { data: sitesData } = useApiData('/api/spatial/sites', [])
  const ds = dsData as DataSource | null
  const sites = (sitesData as SiteListItem[]) ?? []

  const [selectedSite, setSelectedSite] = useState<string>('')
  const [layerName, setLayerName] = useState('')
  const [layerType, setLayerType] = useState<string>('vector')
  const [adding, setAdding] = useState(false)
  const [addErr, setAddErr] = useState<string | null>(null)
  const [addOk, setAddOk] = useState<{ siteSlug: string; layerName: string } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showAttrs, setShowAttrs] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!ds) return
    setLayerName(ds.name)
    setLayerType(TYPE_TO_LAYER[ds.type] ?? 'vector')
  }, [ds])

  async function addToSite() {
    if (!selectedSite || !layerName.trim() || !id) {
      setAddErr('Select a site and give the layer a name.')
      return
    }
    const site = sites.find((s) => s.id === selectedSite)
    if (!site) return
    setAdding(true)
    setAddErr(null)
    setAddOk(null)
    try {
      await apiFetch(`/api/spatial/sites/${site.slug}/layers`, {
        method: 'POST',
        body: JSON.stringify({
          name: layerName.trim(),
          type: layerType,
          data_source_id: id,
          visible: true,
          opacity: 1.0,
          order: 0,
        }),
      })
      setAddOk({ siteSlug: site.slug, layerName: layerName.trim() })
    } catch (e) {
      setAddErr((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  async function deleteSource() {
    if (!ds || !id) return
    if (!confirm(`Delete "${ds.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await apiFetch(`/api/spatial/data-sources/${id}`, { method: 'DELETE' })
      navigate('/admin/data')
    } catch (e) {
      addToast('error', `Delete failed: ${(e as Error).message}`)
      setDeleting(false)
    }
  }

  function copyUrl() {
    if (!ds?.url) return
    navigator.clipboard?.writeText(ds.url).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      },
      () => undefined,
    )
  }

  if (loading) {
    return (
      <div style={centered}>
        <Loader size={20} className="spin" /> Loading data source…
      </div>
    )
  }
  if (error || !ds) {
    return (
      <div style={centered}>
        <AlertCircle size={18} color="#fb7185" />
        <span style={{ color: '#fca5a5' }}>{error || 'Data source not found'}</span>
        <button onClick={() => navigate('/admin/data')} style={ghostBtn}>
          <ChevronLeft size={14} /> Back
        </button>
      </div>
    )
  }

  const meta = TYPE_META[ds.type] ?? TYPE_META.default
  const Icon = meta.icon
  const attributes = Array.isArray(ds.attributes)
    ? ds.attributes
    : Object.entries(ds.attributes ?? {})

  return (
    <div
      style={{
        padding: isPhone ? 14 : 24,
        paddingBottom: isPhone ? 80 : 24,
        color: '#f0f2f8',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <button onClick={() => navigate('/admin/data')} style={ghostBtn}>
          <ChevronLeft size={14} /> Data sources
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowAttrs(true)} style={ghostBtn}>
          <Table2 size={14} /> {isPhone ? '' : 'Attributes'}
        </button>
        <button onClick={deleteSource} disabled={deleting} style={dangerBtn}>
          {deleting ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
          {isPhone ? '' : 'Delete'}
        </button>
      </div>

      {/* Hero */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 18,
          padding: 16,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: meta.tint + '22',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: meta.tint,
            flexShrink: 0,
          }}
        >
          <Icon size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 22,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {ds.name}
          </h1>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(240,242,248,0.5)',
              marginTop: 4,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <span>{meta.label}</span>
            <span>·</span>
            <span>{fmtBytes(ds.size_bytes)}</span>
            {ds.description && (
              <>
                <span>·</span>
                <span>{ds.description}</span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Two columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone ? '1fr' : 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 14,
        }}
      >
        {/* Left: metadata */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ds.url && (
            <Card title="Storage URL">
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 7,
                  fontFamily: 'monospace',
                  fontSize: 11,
                  color: 'rgba(240,242,248,0.8)',
                }}
              >
                <code
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {ds.url}
                </code>
                <button
                  onClick={copyUrl}
                  style={iconBtn}
                  title={copied ? 'Copied!' : 'Copy URL'}
                >
                  <Copy size={12} color={copied ? '#2dd4bf' : undefined} />
                </button>
              </div>
            </Card>
          )}

          <Card title={`Attributes (${attributes.length})`}>
            {attributes.length === 0 ? (
              <div
                style={{
                  padding: 12,
                  fontSize: 12,
                  color: 'rgba(240,242,248,0.5)',
                  textAlign: 'center',
                }}
              >
                No attributes recorded for this data source.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(attributes as unknown[]).slice(0, 10).map((attr, i) => {
                  const name =
                    typeof attr === 'string'
                      ? attr
                      : Array.isArray(attr)
                      ? String(attr[0])
                      : String((attr as { name?: string }).name ?? attr)
                  const type =
                    typeof attr === 'string'
                      ? null
                      : Array.isArray(attr)
                      ? String(attr[1])
                      : (attr as { type?: string }).type
                  return (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 10px',
                        background: 'rgba(255,255,255,0.03)',
                        borderRadius: 6,
                        fontSize: 12,
                      }}
                    >
                      <span style={{ flex: 1, fontFamily: 'monospace' }}>{name}</span>
                      {type && (
                        <span
                          style={{
                            padding: '1px 6px',
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 3,
                            fontSize: 10,
                            color: 'rgba(240,242,248,0.6)',
                          }}
                        >
                          {type}
                        </span>
                      )}
                    </div>
                  )
                })}
                {attributes.length > 10 && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'rgba(240,242,248,0.4)',
                      textAlign: 'center',
                      padding: 4,
                    }}
                  >
                    + {attributes.length - 10} more — view full list via Attributes button
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* Right: add to site */}
        <div>
          <Card title="Add to site">
            <p
              style={{
                margin: '0 0 12px',
                fontSize: 12,
                color: 'rgba(240,242,248,0.55)',
              }}
            >
              Add this data source as a layer on a site so it appears in the viewer.
            </p>
            {addOk && (
              <div
                style={{
                  padding: 10,
                  background: 'rgba(45,212,191,0.06)',
                  border: '1px solid rgba(45,212,191,0.32)',
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                <CheckCircle size={14} color="#2dd4bf" />
                <span style={{ flex: 1, fontSize: 12, color: '#2dd4bf' }}>
                  Added "{addOk.layerName}" to {addOk.siteSlug}
                </span>
                <button
                  onClick={() => navigate(`/admin/sites/${addOk.siteSlug}`)}
                  style={ghostBtn}
                >
                  Open site
                </button>
              </div>
            )}
            {addErr && (
              <div
                style={{
                  padding: 8,
                  background: 'rgba(251,113,133,0.06)',
                  border: '1px solid rgba(251,113,133,0.32)',
                  borderRadius: 7,
                  color: '#fca5a5',
                  fontSize: 11,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <AlertCircle size={12} /> {addErr}
              </div>
            )}
            <Field label="Site *">
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                style={inputStyle}
              >
                <option value="">Choose a site…</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Layer name *">
              <input
                value={layerName}
                onChange={(e) => setLayerName(e.target.value)}
                placeholder="Display name in the layer list"
                style={inputStyle}
              />
            </Field>
            <Field label="Layer type">
              <select
                value={layerType}
                onChange={(e) => setLayerType(e.target.value)}
                style={inputStyle}
              >
                {LAYER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              onClick={addToSite}
              disabled={adding || !selectedSite || !layerName.trim()}
              style={{
                ...primaryBtn,
                width: '100%',
                opacity: adding || !selectedSite || !layerName.trim() ? 0.5 : 1,
              }}
            >
              {adding ? <Loader size={14} className="spin" /> : <Plus size={14} />}
              Add layer
            </button>
          </Card>
        </div>
      </div>

      {showAttrs && id && (
        <AttributeTable
          layerId={id}
          layerName={ds.name}
          layerMeta={{
            type: meta.label,
            description: ds.description ?? '',
          }}
          fetchAttributes={async (layerId) => {
            const data = (await apiFetch(
              `/api/spatial/data-sources/${layerId}/attributes`,
            )) as { features?: never }
            return (data?.features ?? []) as never
          }}
          onClose={() => setShowAttrs(false)}
        />
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
      }}
    >
      <h2
        style={{
          margin: '0 0 12px',
          fontSize: 12,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'rgba(240,242,248,0.65)',
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'rgba(240,242,248,0.55)',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
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
  justifyContent: 'center',
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '6px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const dangerBtn: React.CSSProperties = {
  padding: '6px 10px',
  background: 'rgba(251,113,133,0.10)',
  border: '1px solid rgba(251,113,133,0.32)',
  borderRadius: 6,
  color: '#fb7185',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const iconBtn: React.CSSProperties = {
  padding: 5,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 5,
  color: 'rgba(240,242,248,0.7)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}

const centered: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  padding: 60,
  color: 'rgba(240,242,248,0.6)',
}
