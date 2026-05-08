/** Settings — System panel (T+870 rebuild).
 *
 *  Mounted in the SettingsShell. Configures workspace-level viewer
 *  defaults: which view loads when a user opens the viewer (all-sites
 *  pin map vs preload a specific site) and the default overview
 *  camera. Wires to /api/settings (GET + PUT).
 */

import { useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Globe,
  Loader,
  MapPin,
  Save,
} from 'lucide-react'
import { apiFetch, useApiData } from '../hooks/useApi'
import { useBreakpoint } from '../hooks/useBreakpoint'

type OverviewMode = 'pins' | 'preload_site'

interface Settings {
  overview_mode?: OverviewMode
  preload_site_slug?: string | null
  overview_camera_lon?: number
  overview_camera_lat?: number
  overview_camera_height?: number
}

interface SiteListItem {
  slug: string
  name: string
}

export default function SystemSettingsPage() {
  const { isPhone } = useBreakpoint()
  const { data: settingsData, loading, error: loadError } = useApiData('/api/settings', null)
  const settings = settingsData as Settings | null
  const { data: sitesData } = useApiData('/api/spatial/sites', [])
  const sites = (sitesData as SiteListItem[]) ?? []

  const [mode, setMode] = useState<OverviewMode>('pins')
  const [preloadSlug, setPreloadSlug] = useState('')
  const [lng, setLng] = useState(133)
  const [lat, setLat] = useState(-28)
  const [height, setHeight] = useState(4_000_000)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) return
    setMode((settings.overview_mode as OverviewMode) ?? 'pins')
    setPreloadSlug(settings.preload_site_slug ?? '')
    setLng(settings.overview_camera_lon ?? 133)
    setLat(settings.overview_camera_lat ?? -28)
    setHeight(settings.overview_camera_height ?? 4_000_000)
  }, [settings])

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          overview_mode: mode,
          preload_site_slug: mode === 'preload_site' ? preloadSlug || null : null,
          overview_camera_lon: lng,
          overview_camera_lat: lat,
          overview_camera_height: height,
        }),
      })
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(null), 3000)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        padding: isPhone ? 14 : 24,
        paddingBottom: isPhone ? 80 : 24,
        color: '#f0f2f8',
        maxWidth: 720,
      }}
    >
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600 }}>System</h1>
        <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.5)', fontSize: 13 }}>
          What users see when they first open the viewer.
        </p>
      </header>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(240,242,248,0.5)' }}>
          <Loader size={14} className="spin" /> Loading settings…
        </div>
      )}

      {loadError && (
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
          <AlertCircle size={14} /> {loadError}
        </div>
      )}

      {!loading && settings && (
        <>
          <Card title="Overview mode">
            <div style={{ display: 'grid', gridTemplateColumns: isPhone ? '1fr' : '1fr 1fr', gap: 8 }}>
              <ModeCard
                active={mode === 'pins'}
                icon={<Globe size={18} />}
                title="All sites"
                subtitle="Show every site as a pin on the globe"
                onClick={() => setMode('pins')}
              />
              <ModeCard
                active={mode === 'preload_site'}
                icon={<MapPin size={18} />}
                title="Preload a site"
                subtitle="Open the viewer directly into one site's map"
                onClick={() => setMode('preload_site')}
              />
            </div>
          </Card>

          {mode === 'preload_site' && (
            <Card title="Site to preload">
              <select
                value={preloadSlug}
                onChange={(e) => setPreloadSlug(e.target.value)}
                style={inputStyle}
              >
                <option value="">— Select a site —</option>
                {sites.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
              {sites.length === 0 && (
                <div style={{ fontSize: 11, color: 'rgba(240,242,248,0.45)', marginTop: 4 }}>
                  No sites yet — create one in Atlas first.
                </div>
              )}
            </Card>
          )}

          {mode === 'pins' && (
            <Card title="Default camera">
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'rgba(240,242,248,0.5)' }}>
                Where the camera starts when the all-sites globe loads.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isPhone ? '1fr' : 'repeat(3, 1fr)',
                  gap: 10,
                }}
              >
                <Field label="Longitude">
                  <input
                    type="number"
                    step="0.01"
                    value={lng}
                    onChange={(e) => setLng(parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Latitude">
                  <input
                    type="number"
                    step="0.01"
                    value={lat}
                    onChange={(e) => setLat(parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </Field>
                <Field label="Height (m)">
                  <input
                    type="number"
                    step="1000"
                    value={height}
                    onChange={(e) => setHeight(parseFloat(e.target.value) || 0)}
                    style={inputStyle}
                  />
                </Field>
              </div>
            </Card>
          )}

          {err && (
            <div
              style={{
                padding: 10,
                background: 'rgba(251,113,133,0.06)',
                border: '1px solid rgba(251,113,133,0.32)',
                borderRadius: 7,
                color: '#fca5a5',
                fontSize: 12,
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <AlertCircle size={12} /> {err}
            </div>
          )}

          <button
            onClick={save}
            disabled={saving || (mode === 'preload_site' && !preloadSlug)}
            style={{
              ...primaryBtn,
              opacity: saving || (mode === 'preload_site' && !preloadSlug) ? 0.5 : 1,
            }}
          >
            {saving ? (
              <>
                <Loader size={14} className="spin" /> Saving…
              </>
            ) : savedAt && Date.now() - savedAt < 3000 ? (
              <>
                <Check size={14} /> Saved
              </>
            ) : (
              <>
                <Save size={14} /> Save
              </>
            )}
          </button>
        </>
      )}
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
    <div>
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
  gap: 6,
}
