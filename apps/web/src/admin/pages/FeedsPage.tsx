/** Atlas — External Feeds (T+990).
 *
 *  Workspace-level catalog of recurring connections to external data:
 *  GeoJSON URLs, CSV URLs, OGC APIs, ArcGIS REST, Sheets workbooks,
 *  PostGIS direct connections, etc.
 *
 *  Per-row actions:
 *    Preview  — fetch up to 25 rows through the adapter, show as JSON
 *    Materialise — pick a site + layer, run the adapter, insert
 *                  features (replace or append)
 *    Edit / Delete
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Cloud,
  Database,
  Globe,
  Layers as LayersIcon,
  Loader,
  MapIcon,
  Pencil,
  Plus,
  Radio,
  Search,
  Trash2,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useToast } from '../../viewer/hooks/useToast'

type FeedKind =
  | 'geojson_url'
  | 'csv_url'
  | 'xlsx_url'
  | 'wmts'
  | 'wms'
  | 'xyz'
  | 'ogc_api_features'
  | 'arcgis_rest'
  | 'sheets_workbook'
  | 'postgis_direct'

interface Feed {
  id: string
  name: string
  description: string | null
  kind: FeedKind
  url: string | null
  refresh: 'on_demand' | 'scheduled' | 'webhook'
  schedule_cron: string | null
  source_srid: number
  geometry_hint: { kind: string; [k: string]: unknown }
  config: Record<string, unknown>
  last_fetched_at: string | null
  last_revision: string | null
  last_error: string | null
  enabled: boolean
  /** Layers bound to this feed — joined on the server so the row can
   *  show usage chips and warn before destructive actions break things. */
  layers?: { id: string; name: string; site_slug: string; site_name: string }[]
}

interface SiteListItem {
  id: string
  slug: string
  name: string
}

interface LayerListItem {
  id: string
  name: string
  type: string
}

const KIND_META: Record<FeedKind, { label: string; tint: string }> = {
  geojson_url: { label: 'GeoJSON URL', tint: '#34d399' },
  csv_url: { label: 'CSV URL', tint: '#a78bfa' },
  xlsx_url: { label: 'Excel URL', tint: '#a78bfa' },
  wmts: { label: 'WMTS', tint: '#f59e0b' },
  wms: { label: 'WMS', tint: '#f59e0b' },
  xyz: { label: 'XYZ tiles', tint: '#f59e0b' },
  ogc_api_features: { label: 'OGC API Features', tint: '#2dd4bf' },
  arcgis_rest: { label: 'ArcGIS REST', tint: '#2dd4bf' },
  sheets_workbook: { label: 'Mighty Sheets', tint: '#ec4899' },
  postgis_direct: { label: 'PostGIS direct', tint: '#fb7185' },
}

export default function FeedsPage() {
  const { isPhone } = useBreakpoint()
  const { addToast } = useToast()
  const [feeds, setFeeds] = useState<Feed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Feed | null>(null)
  const [creating, setCreating] = useState(false)
  const [previewFor, setPreviewFor] = useState<Feed | null>(null)
  const [materialiseFor, setMaterialiseFor] = useState<Feed | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = (await apiFetch('/api/feeds')) as Feed[]
      setFeeds(Array.isArray(data) ? data : [])
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return feeds
    return feeds.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.kind.toLowerCase().includes(q) ||
        (f.url ?? '').toLowerCase().includes(q),
    )
  }, [feeds, search])

  async function deleteFeed(f: Feed) {
    if (!confirm(`Delete feed "${f.name}"? Layers bound to it lose their materialisation history.`)) return
    try {
      await apiFetch(`/api/feeds/${f.id}`, { method: 'DELETE' })
      setFeeds((prev) => prev.filter((x) => x.id !== f.id))
    } catch (e) {
      addToast('error', (e as Error).message)
    }
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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600 }}>External feeds</h1>
          <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
            URLs, OGC APIs, Sheets workbooks, and direct connections that back layers and tables.
          </p>
        </div>
        <button onClick={() => setCreating(true)} style={primaryBtn}>
          <Plus size={14} /> New feed
        </button>
      </header>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
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
            placeholder="Search feeds…"
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
          <Radio size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontWeight: 500, color: 'rgba(240,242,248,0.7)' }}>
            {feeds.length === 0 ? 'No feeds yet' : 'No matches'}
          </div>
          {feeds.length === 0 && (
            <>
              <div style={{ fontSize: 12, marginTop: 4 }}>
                Create one to back a layer with a recurring external source.
              </div>
              <button
                onClick={() => setCreating(true)}
                style={{ ...primaryBtn, marginTop: 14 }}
              >
                <Plus size={14} /> Add your first feed
              </button>
            </>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((f) => {
            const meta = KIND_META[f.kind] ?? {
              label: f.kind,
              tint: 'rgba(240,242,248,0.5)',
            }
            return (
              <div
                key={f.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: 12,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 10,
                  opacity: f.enabled ? 1 : 0.55,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    background: meta.tint + '22',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: meta.tint,
                    flexShrink: 0,
                  }}
                >
                  {kindIcon(f.kind)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    {f.name}
                    <span
                      style={{
                        padding: '1px 6px',
                        background: meta.tint + '22',
                        color: meta.tint,
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        borderRadius: 4,
                      }}
                    >
                      {meta.label}
                    </span>
                    {f.last_error && (
                      <span
                        style={{
                          padding: '1px 6px',
                          background: 'rgba(251,113,133,0.18)',
                          color: '#fca5a5',
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          borderRadius: 4,
                        }}
                      >
                        Error
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'rgba(240,242,248,0.45)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginTop: 2,
                    }}
                  >
                    {f.url ? (
                      <code style={{ fontFamily: 'monospace' }}>{f.url}</code>
                    ) : (
                      <span>No URL</span>
                    )}
                    {' · EPSG:'}
                    {f.source_srid}
                    {' · '}
                    {f.last_fetched_at
                      ? `last fetched ${new Date(f.last_fetched_at).toLocaleString()}`
                      : 'never fetched'}
                  </div>
                  {(f.layers?.length ?? 0) > 0 && (
                    <div
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        gap: 6,
                        flexWrap: 'wrap',
                      }}
                    >
                      {(f.layers ?? []).slice(0, 3).map((l) => (
                        <a
                          key={l.id}
                          href={`/admin/sites/${encodeURIComponent(l.site_slug)}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            background: 'rgba(36,83,255,0.10)',
                            border: '1px solid rgba(36,83,255,0.28)',
                            borderRadius: 999,
                            color: '#9bb3ff',
                            fontSize: 10,
                            fontWeight: 500,
                            textDecoration: 'none',
                          }}
                          title={`${l.name} · ${l.site_name}`}
                        >
                          {l.name} · {l.site_name}
                        </a>
                      ))}
                      {(f.layers?.length ?? 0) > 3 && (
                        <span
                          style={{
                            fontSize: 10,
                            color: 'rgba(240,242,248,0.5)',
                            alignSelf: 'center',
                          }}
                        >
                          +{(f.layers?.length ?? 0) - 3} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => setPreviewFor(f)} style={iconBtn} title="Preview rows">
                  <Globe size={12} />
                </button>
                <button
                  onClick={() => setMaterialiseFor(f)}
                  style={iconBtn}
                  title="Materialise into a layer"
                >
                  <LayersIcon size={12} />
                </button>
                <button onClick={() => setEditing(f)} style={iconBtn} title="Edit">
                  <Pencil size={12} />
                </button>
                <button onClick={() => deleteFeed(f)} style={iconBtn} title="Delete">
                  <Trash2 size={12} color="#fb7185" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {creating && (
        <FeedFormModal
          onClose={() => setCreating(false)}
          onSaved={(f) => {
            setFeeds((prev) => [f, ...prev])
            setCreating(false)
          }}
        />
      )}
      {editing && (
        <FeedFormModal
          feed={editing}
          onClose={() => setEditing(null)}
          onSaved={(f) => {
            setFeeds((prev) => prev.map((x) => (x.id === f.id ? f : x)))
            setEditing(null)
          }}
        />
      )}
      {previewFor && (
        <PreviewModal feed={previewFor} onClose={() => setPreviewFor(null)} />
      )}
      {materialiseFor && (
        <MaterialiseModal
          feed={materialiseFor}
          onClose={() => setMaterialiseFor(null)}
          onDone={() => {
            setMaterialiseFor(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function kindIcon(kind: FeedKind) {
  switch (kind) {
    case 'geojson_url':
      return <MapIcon size={18} />
    case 'csv_url':
    case 'xlsx_url':
    case 'sheets_workbook':
      return <Database size={18} />
    case 'wmts':
    case 'wms':
    case 'xyz':
      return <MapIcon size={18} />
    case 'ogc_api_features':
    case 'arcgis_rest':
      return <Cloud size={18} />
    case 'postgis_direct':
      return <Database size={18} />
    default:
      return <Radio size={18} />
  }
}

// ── Form modal (create + edit) ──────────────────────────────────────────

function FeedFormModal({
  feed,
  onClose,
  onSaved,
}: {
  feed?: Feed
  onClose: () => void
  onSaved: (f: Feed) => void
}) {
  const isEdit = !!feed
  const [name, setName] = useState(feed?.name ?? '')
  const [description, setDescription] = useState(feed?.description ?? '')
  const [kind, setKind] = useState<FeedKind>(feed?.kind ?? 'geojson_url')
  const [url, setUrl] = useState(feed?.url ?? '')
  const [sourceSrid, setSourceSrid] = useState(feed?.source_srid ?? 4326)
  const [hintKind, setHintKind] = useState<string>(
    (feed?.geometry_hint?.kind as string) ?? 'native',
  )
  const [lngCol, setLngCol] = useState<string>(
    (feed?.geometry_hint as Record<string, unknown>)?.lng as string ?? 'longitude',
  )
  const [latCol, setLatCol] = useState<string>(
    (feed?.geometry_hint as Record<string, unknown>)?.lat as string ?? 'latitude',
  )
  const [wktCol, setWktCol] = useState<string>(
    (feed?.geometry_hint as Record<string, unknown>)?.column as string ?? 'geom',
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function buildHint(): Record<string, unknown> {
    if (hintKind === 'columns') return { kind: 'columns', lng: lngCol, lat: latCol }
    if (hintKind === 'wkt') return { kind: 'wkt', column: wktCol }
    if (hintKind === 'attribute_only') return { kind: 'attribute_only' }
    return { kind: 'native' }
  }

  async function save() {
    if (!name.trim()) {
      setErr('Name is required.')
      return
    }
    setBusy(true)
    setErr(null)
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || null,
        kind,
        url: url.trim() || null,
        source_srid: sourceSrid,
        geometry_hint: buildHint(),
      }
      const result = isEdit
        ? await apiFetch(`/api/feeds/${feed!.id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
        : await apiFetch('/api/feeds', {
            method: 'POST',
            body: JSON.stringify(body),
          })
      onSaved(result as Feed)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title={isEdit ? `Edit ${feed!.name}` : 'New feed'} width={460}>
      <Field label="Name *">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </Field>
      <Field label="Description">
        <textarea
          value={description ?? ''}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Kind">
          <select value={kind} onChange={(e) => setKind(e.target.value as FeedKind)} style={inputStyle}>
            {(Object.keys(KIND_META) as FeedKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_META[k].label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source SRID">
          <input
            type="number"
            value={sourceSrid}
            onChange={(e) => setSourceSrid(parseInt(e.target.value, 10) || 4326)}
            style={inputStyle}
          />
        </Field>
      </div>
      <Field label="URL">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          style={{ ...inputStyle, fontFamily: 'monospace' }}
        />
      </Field>
      <Field label="Geometry hint">
        <select
          value={hintKind}
          onChange={(e) => setHintKind(e.target.value)}
          style={inputStyle}
        >
          <option value="native">Native — adapter returns geometry</option>
          <option value="columns">Lng/Lat columns → Point</option>
          <option value="wkt">WKT in column → geometry</option>
          <option value="attribute_only">No geometry — attributes only</option>
        </select>
      </Field>
      {hintKind === 'columns' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Longitude column">
            <input value={lngCol} onChange={(e) => setLngCol(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Latitude column">
            <input value={latCol} onChange={(e) => setLatCol(e.target.value)} style={inputStyle} />
          </Field>
        </div>
      )}
      {hintKind === 'wkt' && (
        <Field label="WKT column">
          <input value={wktCol} onChange={(e) => setWktCol(e.target.value)} style={inputStyle} />
        </Field>
      )}
      {err && <Banner>{err}</Banner>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
        <button onClick={onClose} style={ghostBtn}>
          Cancel
        </button>
        <button
          onClick={save}
          disabled={busy}
          style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}
        >
          {busy ? <Loader size={12} className="spin" /> : <Plus size={12} />}
          {isEdit ? 'Save' : 'Create feed'}
        </button>
      </div>
    </Modal>
  )
}

// ── Preview modal ───────────────────────────────────────────────────────

function PreviewModal({ feed, onClose }: { feed: Feed; onClose: () => void }) {
  const [rows, setRows] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    apiFetch(`/api/feeds/${feed.id}/preview`, {
      method: 'POST',
      body: JSON.stringify({ limit: 25 }),
    })
      .then((d) => setRows(((d as { rows?: unknown[] }).rows ?? []) as unknown[]))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.id])

  return (
    <Modal onClose={onClose} title={`Preview · ${feed.name}`} width={600}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(240,242,248,0.6)' }}>
          <Loader size={14} className="spin" /> Fetching…
        </div>
      ) : err ? (
        <Banner>{err}</Banner>
      ) : rows.length === 0 ? (
        <div style={{ color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>No rows returned.</div>
      ) : (
        <div
          style={{
            maxHeight: 400,
            overflow: 'auto',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            padding: 10,
          }}
        >
          <pre
            style={{
              margin: 0,
              fontSize: 11,
              color: 'rgba(240,242,248,0.85)',
              fontFamily: 'monospace',
              whiteSpace: 'pre-wrap',
            }}
          >
            {JSON.stringify(rows, null, 2)}
          </pre>
        </div>
      )}
    </Modal>
  )
}

// ── Materialise modal ──────────────────────────────────────────────────

function MaterialiseModal({
  feed,
  onClose,
  onDone,
}: {
  feed: Feed
  onClose: () => void
  onDone: () => void
}) {
  const [sites, setSites] = useState<SiteListItem[]>([])
  const [layers, setLayers] = useState<LayerListItem[]>([])
  const [siteSlug, setSiteSlug] = useState('')
  const [layerId, setLayerId] = useState('')
  const [replace, setReplace] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null)

  useEffect(() => {
    apiFetch('/api/spatial/sites')
      .then((d) => setSites(((d as SiteListItem[]) ?? [])))
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!siteSlug) {
      setLayers([])
      return
    }
    apiFetch(`/api/spatial/sites/${siteSlug}/layers`)
      .then((d) => setLayers(((d as LayerListItem[]) ?? [])))
      .catch(() => setLayers([]))
  }, [siteSlug])

  async function run() {
    setBusy(true)
    setErr(null)
    try {
      const out = (await apiFetch(`/api/feeds/${feed.id}/materialise`, {
        method: 'POST',
        body: JSON.stringify({
          site_slug: siteSlug,
          layer_id: layerId,
          replace_existing: replace,
        }),
      })) as { inserted: number; skipped: number }
      setResult(out)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} title={`Materialise · ${feed.name}`} width={460}>
      {result ? (
        <>
          <div
            style={{
              padding: 14,
              background: 'rgba(45,212,191,0.06)',
              border: '1px solid rgba(45,212,191,0.32)',
              borderRadius: 8,
              color: '#2dd4bf',
              fontSize: 13,
              marginBottom: 12,
            }}
          >
            Inserted {result.inserted} feature{result.inserted === 1 ? '' : 's'}.{' '}
            {result.skipped > 0 && (
              <>{result.skipped} row(s) skipped (no valid geometry).</>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={onDone} style={primaryBtn}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <Field label="Target site">
            <select
              value={siteSlug}
              onChange={(e) => setSiteSlug(e.target.value)}
              style={inputStyle}
            >
              <option value="">Choose a site…</option>
              {sites.map((s) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target layer">
            <select
              value={layerId}
              onChange={(e) => setLayerId(e.target.value)}
              disabled={!siteSlug}
              style={inputStyle}
            >
              <option value="">Choose a layer…</option>
              {layers.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.type}
                </option>
              ))}
            </select>
          </Field>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: 10,
              background: replace ? 'rgba(245,158,11,0.06)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${replace ? 'rgba(245,158,11,0.32)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 7,
              cursor: 'pointer',
              marginBottom: 12,
            }}
          >
            <input
              type="checkbox"
              checked={replace}
              onChange={(e) => setReplace(e.target.checked)}
            />
            <span style={{ fontSize: 12 }}>
              Replace existing features in this layer (otherwise rows are appended)
            </span>
          </label>
          {err && <Banner>{err}</Banner>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={ghostBtn}>
              Cancel
            </button>
            <button
              onClick={run}
              disabled={busy || !siteSlug || !layerId}
              style={{
                ...primaryBtn,
                opacity: busy || !siteSlug || !layerId ? 0.5 : 1,
              }}
            >
              {busy ? <Loader size={12} className="spin" /> : <Plus size={12} />}
              {busy ? 'Materialising…' : 'Materialise'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── Shared bits ─────────────────────────────────────────────────────────

function Modal({
  title,
  width = 380,
  onClose,
  children,
}: {
  title: string
  width?: number
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: 'calc(100vw - 32px)',
          background: '#15151c',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 18,
          color: '#f0f2f8',
        }}
      >
        <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 600 }}>{title}</h2>
        {children}
      </div>
    </div>
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

function Banner({ children }: { children: React.ReactNode }) {
  return (
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
      <AlertCircle size={12} /> {children}
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
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '7px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 12,
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
