/** Atlas — Add layer to site (T+360).
 *
 *  SiteDetailPage links to /admin/sites/{slug}/add-layer; this page
 *  closes that loop. Two paths:
 *
 *    1. Reuse an existing data source — pick from the catalog dropdown
 *    2. Quick-create from URL — shorthand for one-off vector / raster /
 *       3D-tiles layers without a separate DataSource record
 *
 *  POSTs to /api/spatial/sites/{slug}/layers and bounces back to the
 *  site detail page.
 */

import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ChevronLeft,
  Cloud,
  Database,
  Layers,
  Loader,
  Plus,
} from 'lucide-react'
import { apiFetch } from '../hooks/useApi'

interface DataSource {
  id: string
  name: string
  type: string
  url: string | null
  size_bytes: number | null
}

const LAYER_TYPES = [
  { id: 'vector', label: 'Vector / GeoJSON' },
  { id: 'raster', label: 'Raster (XYZ tiles)' },
  { id: '3d-tiles', label: '3D Tiles' },
  { id: 'kml', label: 'KML' },
  { id: 'czml', label: 'CZML' },
] as const

type Mode = 'existing' | 'fromUrl'

export default function SiteAddLayerPage() {
  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const [mode, setMode] = useState<Mode>('existing')
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [loadingDs, setLoadingDs] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Form fields (shared across both modes where applicable)
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('vector')
  const [opacity, setOpacity] = useState(100)
  const [visible, setVisible] = useState(true)

  // Mode: existing
  const [dsId, setDsId] = useState<string>('')

  // Mode: from URL
  const [url, setUrl] = useState('')

  useEffect(() => {
    apiFetch('/api/spatial/data-sources')
      .then((d) => setDataSources((d as DataSource[]) ?? []))
      .catch(() => setDataSources([]))
      .finally(() => setLoadingDs(false))
  }, [])

  // When picking an existing data source, default the layer name + type.
  useEffect(() => {
    if (mode !== 'existing' || !dsId) return
    const ds = dataSources.find((d) => d.id === dsId)
    if (!ds) return
    if (!name) setName(ds.name)
    setType(ds.type)
  }, [dsId, mode, dataSources, name])

  async function save() {
    if (!slug) return
    if (!name.trim()) {
      setError('Layer name is required.')
      return
    }
    if (mode === 'existing' && !dsId) {
      setError('Pick a data source.')
      return
    }
    if (mode === 'fromUrl' && !url.trim()) {
      setError('URL is required for this mode.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        type,
        visible,
        opacity: opacity / 100,
        order: 0,
        style: {},
        metadata: mode === 'fromUrl' ? { url: url.trim() } : {},
      }
      if (mode === 'existing') body.data_source_id = dsId
      await apiFetch(`/api/spatial/sites/${slug}/layers`, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      navigate(`/admin/sites/${slug}`)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: 24, color: '#f0f2f8', maxWidth: 720 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <button onClick={() => navigate(`/admin/sites/${slug}`)} style={ghostBtn}>
          <ChevronLeft size={14} /> Site
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={save}
          disabled={saving}
          style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <Loader size={14} className="spin" /> : <Plus size={14} />}
          {saving ? 'Adding…' : 'Add layer'}
        </button>
      </div>

      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #2453ff, #a78bfa)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
        >
          <Layers size={26} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>Add layer</h1>
          <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
            Reuse a data source from the catalog, or quick-create one from a URL.
          </p>
        </div>
      </header>

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
          {error}
        </div>
      )}

      {/* Mode selector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <ModeCard
          active={mode === 'existing'}
          icon={<Database size={18} />}
          title="From data source"
          subtitle={`Reuse one of ${dataSources.length} catalogued sources`}
          onClick={() => setMode('existing')}
        />
        <ModeCard
          active={mode === 'fromUrl'}
          icon={<Cloud size={18} />}
          title="From URL"
          subtitle="Quick-create a one-off layer"
          onClick={() => setMode('fromUrl')}
        />
      </div>

      {/* Mode-specific input */}
      {mode === 'existing' ? (
        <Card title="Pick a data source">
          {loadingDs ? (
            <div style={{ color: 'rgba(240,242,248,0.5)' }}>Loading…</div>
          ) : dataSources.length === 0 ? (
            <div
              style={{
                padding: 12,
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.32)',
                borderRadius: 8,
                color: '#f59e0b',
                fontSize: 12,
              }}
            >
              No catalogued data sources yet. Switch to "From URL" or upload one in the Upload page.
            </div>
          ) : (
            <select
              value={dsId}
              onChange={(e) => setDsId(e.target.value)}
              style={input()}
            >
              <option value="" disabled>
                Choose a data source…
              </option>
              {dataSources.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.type}
                </option>
              ))}
            </select>
          )}
        </Card>
      ) : (
        <Card title="Source URL">
          <Field label="URL">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/data.geojson"
              style={{ ...input(), fontFamily: 'monospace' }}
            />
          </Field>
        </Card>
      )}

      {/* Layer config */}
      <Card title="Layer">
        <Field label="Display name *">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Roads"
            style={input()}
          />
        </Field>
        <Field label="Type">
          <select value={type} onChange={(e) => setType(e.target.value)} style={input()}>
            {LAYER_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
          <Field label={`Opacity (${opacity}%)`}>
            <input
              type="range"
              min={0}
              max={100}
              value={opacity}
              onChange={(e) => setOpacity(parseInt(e.target.value, 10))}
              style={{ width: '100%' }}
            />
          </Field>
          <Field label="Visible">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
                style={{ accentColor: '#2453ff' }}
              />
              <span style={{ fontSize: 13, color: 'rgba(240,242,248,0.7)' }}>
                {visible ? 'On by default' : 'Hidden'}
              </span>
            </label>
          </Field>
        </div>
      </Card>
    </div>
  )
}

function ModeCard({
  active,
  icon,
  title,
  subtitle,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        padding: 14,
        background: active ? 'rgba(36,83,255,0.10)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${active ? 'rgba(36,83,255,0.4)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 10,
        color: '#f0f2f8',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        font: 'inherit',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: active ? 'rgba(36,83,255,0.18)' : 'rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: active ? '#9bb3ff' : 'rgba(240,242,248,0.7)',
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.5)', marginTop: 2 }}>
          {subtitle}
        </div>
      </div>
    </button>
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
        marginBottom: 14,
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

function input(): React.CSSProperties {
  return {
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
