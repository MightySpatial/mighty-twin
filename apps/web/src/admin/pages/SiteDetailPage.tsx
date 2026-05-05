/** Atlas Site Detail — Phase T (T+180) full rebuild.
 *
 *  Replaces the v1 JSX page that used legacy field names (is_public,
 *  primary_color top-level) and a checkbox public toggle. Now wired to
 *  the actual MightyTwin API:
 *
 *    - is_public_pre_login is the source of truth
 *    - Branding / camera / marker live inside `config` JSON
 *    - Snapshot gallery pulls from /api/spatial/sites/{slug}/snapshots
 *    - Click-to-edit site name (inline rename, save on blur or Enter)
 *    - Layer count is a header chip, not a section title
 *
 *  The page is the closest thing the publisher has to a "site dashboard"
 *  so the layout is information-dense without being cluttered.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Image as ImageIcon,
  Loader,
  Lock,
  Package,
  Palette,
  Pencil,
  Plus,
  Save,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { apiFetch, useApiData } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useToast } from '../../viewer/hooks/useToast'
import LayerStyleEditor from '../components/LayerStyleEditor'
import LayerImportModal from '../components/LayerImportModal'

interface Layer {
  id: string
  name: string
  type: string
  visible: boolean
  opacity: number
  order: number
  style?: Record<string, unknown> | null
  data_source_id?: string | null
}

interface SnapshotEntry {
  id: string
  name: string
  description: string | null
  thumbnail_url: string | null
  owner_name: string
  shared_to_gallery: boolean
  created_at: string | null
}

interface SiteDetail {
  id: string
  slug: string
  name: string
  description: string | null
  storage_srid: number
  is_public_pre_login: boolean
  layers?: Layer[]
  // Spread from config:
  primary_color?: string
  logo_url?: string
  marker_color?: string
  marker_symbol?: string
  default_camera?: { longitude: number; latitude: number; height: number }
}

export default function SiteDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { isPhone } = useBreakpoint()
  const { addToast } = useToast()
  const { data, loading, error, reload, setData } = useApiData(
    slug ? `/api/spatial/sites/${slug}` : null,
    null,
  )
  const site = data as SiteDetail | null

  const [savingField, setSavingField] = useState<string | null>(null)
  const [snapshots, setSnapshots] = useState<SnapshotEntry[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [stylingLayer, setStylingLayer] = useState<Layer | null>(null)
  const [importingLayer, setImportingLayer] = useState<Layer | null>(null)

  const [storyMaps, setStoryMaps] = useState<{ id: string; name: string; is_published: boolean; slides?: unknown[] }[]>([])

  const layers = useMemo(() => site?.layers ?? [], [site?.layers])

  useEffect(() => {
    if (!site?.slug) return
    setSnapshotsLoading(true)
    apiFetch(`/api/spatial/sites/${site.slug}/snapshots`)
      .then((d) => setSnapshots((d as SnapshotEntry[]) ?? []))
      .catch(() => setSnapshots([]))
      .finally(() => setSnapshotsLoading(false))
    apiFetch(`/api/story-maps?site_slug=${site.slug}`)
      .then((d) =>
        setStoryMaps(Array.isArray(d) ? (d as typeof storyMaps) : []),
      )
      .catch(() => setStoryMaps([]))
    setNameDraft(site.name)
  }, [site?.slug, site?.name])

  async function patch(body: Record<string, unknown>, fieldKey: string) {
    if (!slug) return
    setSavingField(fieldKey)
    try {
      const updated = (await apiFetch(`/api/spatial/sites/${slug}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })) as SiteDetail
      setData(updated)
    } catch (e) {
      addToast('error', `Save failed: ${(e as Error).message}`)
    } finally {
      setSavingField(null)
    }
  }

  async function patchConfig(configPartial: Record<string, unknown>, fieldKey: string) {
    return patch({ config: configPartial }, fieldKey)
  }

  async function deleteSite() {
    if (!site) return
    if (!confirm(`Delete site "${site.name}"? This removes all of its layers.`)) return
    try {
      await apiFetch(`/api/spatial/sites/${site.slug}`, { method: 'DELETE' })
      navigate('/admin/sites')
    } catch (e) {
      addToast('error', `Delete failed: ${(e as Error).message}`)
    }
  }

  const [exporting, setExporting] = useState(false)
  async function exportPackage() {
    if (!site) return
    setExporting(true)
    try {
      const token = localStorage.getItem('accessToken')
      const res = await fetch(
        `${import.meta.env.VITE_API_URL || ''}/api/spatial/sites/${site.slug}/export`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      )
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        throw new Error(t || `Export failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${site.slug}.mtsite`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      addToast('success', `Exported ${site.slug}.mtsite`)
    } catch (e) {
      addToast('error', `Export failed: ${(e as Error).message}`)
    } finally {
      setExporting(false)
    }
  }

  async function commitName() {
    if (!site) return
    const next = nameDraft.trim()
    setEditingName(false)
    if (!next || next === site.name) return
    await patch({ name: next }, 'name')
  }

  async function toggleLayerVisible(layer: Layer) {
    if (!slug) return
    try {
      await apiFetch(`/api/spatial/sites/${slug}/layers/${layer.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ visible: !layer.visible }),
      })
      reload()
    } catch (e) {
      addToast('error', `Layer toggle failed: ${(e as Error).message}`)
    }
  }

  async function moveLayer(layer: Layer, dir: 'up' | 'down', sorted: Layer[]) {
    if (!slug) return
    const idx = sorted.findIndex((l) => l.id === layer.id)
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= sorted.length) return
    const a = sorted[idx]
    const b = sorted[target]
    // Swap their order values; persist both PATCHes in parallel.
    try {
      await Promise.all([
        apiFetch(`/api/spatial/sites/${slug}/layers/${a.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ order: b.order }),
        }),
        apiFetch(`/api/spatial/sites/${slug}/layers/${b.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ order: a.order }),
        }),
      ])
      reload()
    } catch (e) {
      addToast('error', `Reorder failed: ${(e as Error).message}`)
    }
  }

  async function deleteLayer(layer: Layer) {
    if (!slug) return
    if (!confirm(`Remove layer "${layer.name}" from this site?`)) return
    try {
      await apiFetch(`/api/spatial/sites/${slug}/layers/${layer.id}`, {
        method: 'DELETE',
      })
      reload()
    } catch (e) {
      addToast('error', `Layer delete failed: ${(e as Error).message}`)
    }
  }

  async function unshareSnapshot(s: SnapshotEntry) {
    try {
      await apiFetch(`/me/snapshots/${s.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ shared_to_gallery: false }),
      })
      setSnapshots((prev) => prev.filter((x) => x.id !== s.id))
    } catch (e) {
      addToast('error', (e as Error).message)
    }
  }

  if (loading) {
    return (
      <Centered>
        <Loader size={20} className="spin" /> Loading site…
      </Centered>
    )
  }
  if (error || !site) {
    return (
      <Centered>
        <AlertCircle size={20} color="#fb7185" />
        <span style={{ color: '#fca5a5' }}>{error || 'Site not found'}</span>
        <button onClick={() => navigate('/admin/sites')} style={ghostBtn}>
          <ChevronLeft size={14} /> Back to sites
        </button>
      </Centered>
    )
  }

  const cfg = site as SiteDetail
  const camera = cfg.default_camera ?? { longitude: 0, latitude: 0, height: 1000 }

  return (
    <div style={{ padding: isPhone ? 14 : 24, color: '#f0f2f8' }}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <button onClick={() => navigate('/admin/sites')} style={ghostBtn}>
          <ChevronLeft size={14} /> Sites
        </button>
        <div style={{ flex: 1 }} />
        <a
          href={`/viewer/sites/${site.slug}`}
          target="_blank"
          rel="noreferrer"
          style={ghostBtn}
        >
          <ExternalLink size={14} /> {isPhone ? 'Viewer' : 'Open in viewer'}
        </a>
        {site.is_public_pre_login && (
          <button
            onClick={() => {
              const url = `${window.location.origin}/p/${site.slug}`
              navigator.clipboard?.writeText(url).then(
                () => addToast('success', `Public link copied — ${url}`),
                () => addToast('error', 'Couldn\'t copy to clipboard'),
              )
            }}
            style={ghostBtn}
            title="Copy the public /p/<slug> URL — anyone with the link can view"
          >
            <Share2 size={14} /> {isPhone ? '' : 'Public link'}
          </button>
        )}
        <button
          onClick={exportPackage}
          disabled={exporting}
          style={ghostBtn}
          title="Download a .mtsite package of this site"
        >
          {exporting ? <Loader size={14} className="spin" /> : <Package size={14} />}
          {isPhone ? '' : exporting ? 'Exporting…' : 'Export'}
        </button>
        <button onClick={deleteSite} style={dangerBtn}>
          <Trash2 size={14} /> {isPhone ? '' : 'Delete site'}
        </button>
      </div>

      {/* Hero header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: isPhone ? 12 : 18,
          marginBottom: 18,
          padding: isPhone ? 14 : 18,
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `linear-gradient(135deg, ${cfg.primary_color ?? '#2453ff'}, #a78bfa)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {site.name.slice(0, 1).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName()
                if (e.key === 'Escape') {
                  setNameDraft(site.name)
                  setEditingName(false)
                }
              }}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(36,83,255,0.4)',
                borderRadius: 8,
                color: '#f0f2f8',
                fontSize: 22,
                fontWeight: 600,
                padding: '4px 10px',
                outline: 'none',
              }}
            />
          ) : (
            <h1
              onClick={() => setEditingName(true)}
              style={{
                margin: 0,
                fontSize: 24,
                fontWeight: 600,
                cursor: 'text',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 6,
              }}
              title="Click to rename"
            >
              {site.name}
              {savingField === 'name' ? (
                <Loader size={14} className="spin" />
              ) : (
                <Pencil
                  size={14}
                  color="rgba(240,242,248,0.3)"
                  style={{ marginLeft: 4 }}
                />
              )}
            </h1>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 6,
              fontSize: 12,
              flexWrap: 'wrap',
            }}
          >
            <code
              style={{
                padding: '2px 8px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 4,
                fontSize: 11,
                color: 'rgba(240,242,248,0.65)',
              }}
            >
              {site.slug}
            </code>
            <Chip>
              {layers.length} layer{layers.length === 1 ? '' : 's'}
            </Chip>
            <Chip>
              {storyMaps.length} story map{storyMaps.length === 1 ? '' : 's'}
            </Chip>
            <Chip>
              {snapshots.length} snap{snapshots.length === 1 ? '' : 's'}
            </Chip>
            <Chip>EPSG:{site.storage_srid}</Chip>
          </div>
        </div>

        {/* Public toggle (right side of header) */}
        <PublicToggle
          isPublic={site.is_public_pre_login}
          slug={site.slug}
          saving={savingField === 'public'}
          onChange={(v) => patch({ is_public_pre_login: v }, 'public')}
        />
      </header>

      {/* Main columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isPhone ? '1fr' : 'minmax(0, 2fr) minmax(0, 3fr)',
          gap: 16,
        }}
      >
        {/* Left col — settings */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="Description">
            <textarea
              defaultValue={site.description ?? ''}
              onBlur={(e) => {
                if ((e.target.value || null) !== site.description)
                  patch({ description: e.target.value || null }, 'description')
              }}
              rows={3}
              placeholder="What's this site for?"
              style={input(true)}
            />
          </Card>

          <Card title="Branding">
            <Row label="Primary colour">
              <ColorInput
                value={cfg.primary_color ?? '#2453ff'}
                onCommit={(v) => patchConfig({ primary_color: v }, 'primary_color')}
              />
            </Row>
            <Row label="Logo URL">
              <input
                defaultValue={cfg.logo_url ?? ''}
                onBlur={(e) =>
                  patchConfig({ logo_url: e.target.value || null }, 'logo_url')
                }
                placeholder="https://…"
                style={input()}
              />
            </Row>
            {cfg.logo_url && (
              <img
                src={cfg.logo_url}
                alt=""
                style={{
                  marginTop: 8,
                  maxHeight: 36,
                  borderRadius: 4,
                  background: 'rgba(255,255,255,0.04)',
                  padding: 4,
                }}
              />
            )}
          </Card>

          <Card title="Default camera">
            <Row label="Longitude">
              <input
                type="number"
                step="0.0001"
                defaultValue={camera.longitude}
                onBlur={(e) =>
                  patchConfig(
                    {
                      default_camera: {
                        ...camera,
                        longitude: parseFloat(e.target.value) || 0,
                      },
                    },
                    'camera_lng',
                  )
                }
                style={input()}
              />
            </Row>
            <Row label="Latitude">
              <input
                type="number"
                step="0.0001"
                defaultValue={camera.latitude}
                onBlur={(e) =>
                  patchConfig(
                    {
                      default_camera: {
                        ...camera,
                        latitude: parseFloat(e.target.value) || 0,
                      },
                    },
                    'camera_lat',
                  )
                }
                style={input()}
              />
            </Row>
            <Row label="Height (m)">
              <input
                type="number"
                step="100"
                defaultValue={camera.height}
                onBlur={(e) =>
                  patchConfig(
                    {
                      default_camera: {
                        ...camera,
                        height: parseFloat(e.target.value) || 1000,
                      },
                    },
                    'camera_height',
                  )
                }
                style={input()}
              />
            </Row>
          </Card>
        </div>

        {/* Right col — layers + snapshots + story maps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card
            title={`Layers (${layers.length})`}
            action={
              <Link to={`/admin/sites/${slug}/add-layer`} style={primaryBtn}>
                <Plus size={12} /> Add layer
              </Link>
            }
          >
            {layers.length === 0 ? (
              <Empty
                icon={<Plus size={20} />}
                title="No layers yet"
                hint="Add one to start visualising this site."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(() => {
                  const sorted = [...layers].sort((a, b) => a.order - b.order)
                  return sorted.map((l, idx) => (
                    <LayerRow
                      key={l.id}
                      layer={l}
                      canUp={idx > 0}
                      canDown={idx < sorted.length - 1}
                      onToggle={() => toggleLayerVisible(l)}
                      onDelete={() => deleteLayer(l)}
                      onStyle={() => setStylingLayer(l)}
                      onImport={() => setImportingLayer(l)}
                      onMove={(dir) => moveLayer(l, dir, sorted)}
                    />
                  ))
                })()}
              </div>
            )}
          </Card>

          <Card
            title={`Snap gallery (${snapshots.length})`}
            action={
              <Link to="/admin/snapshots" style={primaryBtn}>
                <ImageIcon size={12} /> All snaps
              </Link>
            }
          >
            {snapshotsLoading ? (
              <div style={{ color: 'rgba(240,242,248,0.5)' }}>Loading…</div>
            ) : snapshots.length === 0 ? (
              <Empty
                icon={<ImageIcon size={20} />}
                title="No snaps in the gallery"
                hint="Users can share their snaps to this gallery from the viewer."
              />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: 8,
                }}
              >
                {snapshots.map((s) => (
                  <SnapshotTile
                    key={s.id}
                    snap={s}
                    siteSlug={site.slug}
                    onUnshare={() => unshareSnapshot(s)}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card
            title={`Story maps (${storyMaps.length})`}
            action={
              <Link to="/admin/stories" style={primaryBtn}>
                <Plus size={12} /> Manage
              </Link>
            }
          >
            {storyMaps.length === 0 ? (
              <Empty
                icon={<Globe size={20} />}
                title="No story maps yet"
                hint="Build guided narratives that walk users through this site."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {storyMaps.map((sm) => (
                  <Link
                    to="/admin/stories"
                    key={sm.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: 10,
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 8,
                      color: '#f0f2f8',
                      textDecoration: 'none',
                      transition: 'border-color 120ms',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.borderColor = 'rgba(167,139,250,0.4)')
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)')
                    }
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{sm.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.4)' }}>
                        {(sm.slides as unknown[] | undefined)?.length ?? 0} slides ·{' '}
                        {sm.is_published ? 'Published' : 'Draft'}
                      </div>
                    </div>
                    {sm.is_published ? (
                      <Globe size={14} color="#34d399" />
                    ) : (
                      <Lock size={14} color="rgba(240,242,248,0.4)" />
                    )}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {stylingLayer && (
        <LayerStyleEditor
          siteSlug={site.slug}
          layer={stylingLayer}
          onClose={() => setStylingLayer(null)}
          onSaved={() => {
            setStylingLayer(null)
            reload()
          }}
        />
      )}

      {importingLayer && (
        <LayerImportModal
          siteSlug={site.slug}
          layer={importingLayer}
          onClose={() => setImportingLayer(null)}
          onDone={(counts) => {
            const inserted = counts.inserted ?? 0
            const skipped = counts.skipped ?? 0
            setImportingLayer(null)
            addToast(
              skipped > 0 ? 'warning' : 'success',
              `Imported ${inserted} feature${inserted === 1 ? '' : 's'}` +
                (skipped > 0 ? ` (skipped ${skipped} without geometry)` : ''),
            )
            reload()
          }}
        />
      )}
    </div>
  )
}

// ── Subcomponents ───────────────────────────────────────────────────────

function PublicToggle({
  isPublic,
  slug,
  saving,
  onChange,
}: {
  isPublic: boolean
  slug: string
  saving: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      style={{
        padding: 12,
        background: isPublic ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isPublic ? 'rgba(34,197,94,0.32)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10,
        minWidth: 240,
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'rgba(240,242,248,0.45)',
          marginBottom: 6,
        }}
      >
        Public access
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <ToggleSwitch checked={isPublic} onChange={onChange} disabled={saving} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: isPublic ? '#34d399' : 'rgba(240,242,248,0.7)',
            }}
          >
            {isPublic ? 'Public' : 'Authenticated only'}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.45)' }}>
            {isPublic ? (
              <>
                Reachable at{' '}
                <code style={{ padding: '0 4px' }}>/p/{slug}</code>
              </>
            ) : (
              'Sign-in required'
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        background: checked ? '#22c55e' : 'rgba(255,255,255,0.12)',
        border: 'none',
        cursor: disabled ? 'wait' : 'pointer',
        position: 'relative',
        transition: 'background 160ms',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: checked ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#fff',
          transition: 'left 160ms',
        }}
      />
    </button>
  )
}

function LayerRow({
  layer,
  canUp,
  canDown,
  onToggle,
  onDelete,
  onStyle,
  onImport,
  onMove,
}: {
  layer: Layer
  canUp: boolean
  canDown: boolean
  onToggle: () => void
  onDelete: () => void
  onStyle: () => void
  onImport: () => void
  onMove: (dir: 'up' | 'down') => void
}) {
  const swatch = (layer.style as Record<string, unknown> | null)?.strokeColor as
    | string
    | undefined
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: 10,
        background: layer.visible ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 8,
        opacity: layer.visible ? 1 : 0.55,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <button
          onClick={() => onMove('up')}
          disabled={!canUp}
          style={{
            padding: 2,
            background: 'transparent',
            border: 'none',
            color: canUp ? 'rgba(240,242,248,0.6)' : 'rgba(240,242,248,0.2)',
            cursor: canUp ? 'pointer' : 'not-allowed',
            lineHeight: 0,
          }}
          title="Move up"
        >
          <ChevronUp size={12} />
        </button>
        <button
          onClick={() => onMove('down')}
          disabled={!canDown}
          style={{
            padding: 2,
            background: 'transparent',
            border: 'none',
            color: canDown ? 'rgba(240,242,248,0.6)' : 'rgba(240,242,248,0.2)',
            cursor: canDown ? 'pointer' : 'not-allowed',
            lineHeight: 0,
          }}
          title="Move down"
        >
          <ChevronDown size={12} />
        </button>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{layer.name}</div>
        <div
          style={{
            fontSize: 11,
            color: 'rgba(240,242,248,0.4)',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <span>{layer.type}</span>
          {layer.opacity < 1 && <span>{Math.round(layer.opacity * 100)}%</span>}
          {layer.data_source_id && (
            <Link
              to={`/admin/data/${layer.data_source_id}`}
              onClick={(e) => e.stopPropagation()}
              style={{
                color: 'rgba(167,139,250,0.85)',
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 3,
              }}
              title="Open data source"
              onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
              onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
            >
              data source ↗
            </Link>
          )}
        </div>
      </div>
      <button
        onClick={onImport}
        style={iconBtn}
        title="Import features (GeoJSON / CSV)"
      >
        <Plus size={14} />
      </button>
      <button
        onClick={onStyle}
        style={iconBtn}
        title="Edit style"
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {swatch && (
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: swatch,
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            />
          )}
          <Palette size={14} />
        </span>
      </button>
      <button onClick={onToggle} style={iconBtn} title={layer.visible ? 'Hide' : 'Show'}>
        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button onClick={onDelete} style={iconBtn} title="Remove">
        <Trash2 size={14} color="#fb7185" />
      </button>
    </div>
  )
}

function SnapshotTile({
  snap,
  siteSlug,
  onUnshare,
}: {
  snap: SnapshotEntry
  siteSlug: string
  onUnshare: () => void
}) {
  const openInViewer = () => {
    window.open(
      `/viewer/sites/${siteSlug}?snapshot=${snap.id}`,
      '_blank',
      'noopener,noreferrer',
    )
  }
  return (
    <div
      onClick={openInViewer}
      title="Open in viewer"
      style={{
        position: 'relative',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
        overflow: 'hidden',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          aspectRatio: '4 / 3',
          background: snap.thumbnail_url
            ? `center/cover no-repeat url(${snap.thumbnail_url})`
            : 'linear-gradient(135deg, rgba(36,83,255,0.4), rgba(167,139,250,0.4))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {!snap.thumbnail_url && <ImageIcon size={20} color="#fff" />}
      </div>
      <div style={{ padding: 10 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {snap.name}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(240,242,248,0.4)', marginTop: 2 }}>
          {snap.owner_name}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onUnshare()
        }}
        title="Remove from gallery"
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          padding: 4,
          background: 'rgba(0,0,0,0.5)',
          border: 'none',
          borderRadius: 6,
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        <X size={12} />
      </button>
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          padding: '2px 6px',
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 4,
          color: '#34d399',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Share2 size={10} />
        Shared
      </div>
    </div>
  )
}

function Card({
  title,
  action,
  children,
}: {
  title: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        padding: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 13,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            color: 'rgba(240,242,248,0.7)',
          }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr',
        alignItems: 'center',
        gap: 10,
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: 'rgba(240,242,248,0.5)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function Empty({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <div
      style={{
        padding: 24,
        textAlign: 'center',
        background: 'rgba(255,255,255,0.02)',
        border: '1px dashed rgba(255,255,255,0.08)',
        borderRadius: 10,
      }}
    >
      <div style={{ color: 'rgba(240,242,248,0.4)', marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 13, color: 'rgba(240,242,248,0.7)' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.4)', marginTop: 2 }}>
        {hint}
      </div>
    </div>
  )
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        padding: '2px 8px',
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 4,
        fontSize: 11,
        color: 'rgba(240,242,248,0.65)',
      }}
    >
      {children}
    </span>
  )
}

function ColorInput({
  value,
  onCommit,
}: {
  value: string
  onCommit: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="color"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        style={{
          width: 36,
          height: 28,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
        }}
      />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== value && onCommit(draft)}
        style={{ ...input(), maxWidth: 120, fontFamily: 'monospace' }}
      />
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: 60,
        color: 'rgba(240,242,248,0.6)',
      }}
    >
      {children}
    </div>
  )
}

// ── Style helpers ───────────────────────────────────────────────────────

function input(textarea = false): React.CSSProperties {
  return {
    width: '100%',
    padding: '7px 10px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 7,
    color: '#f0f2f8',
    fontSize: 12,
    outline: 'none',
    boxSizing: 'border-box',
    resize: textarea ? 'vertical' : undefined,
    fontFamily: 'inherit',
  }
}

const primaryBtn: React.CSSProperties = {
  padding: '6px 10px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 6,
  color: '#fff',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  textDecoration: 'none',
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
  textDecoration: 'none',
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
  padding: 6,
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 6,
  color: 'rgba(240,242,248,0.7)',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
}
