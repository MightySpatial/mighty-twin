/** Public-pre-login viewer page — Phase M.
 *
 *  Mounted at /p/<slug>. Bypasses the auth gate entirely. Fetches site
 *  data from /api/public/sites/<slug> (no Bearer token), then renders a
 *  stripped MapShell with publicMode=true and the basic-widgets-only
 *  filter applied.
 *
 *  This route does NOT use the App-level shell (the auth gate, the
 *  Map | Map+Atlas | Atlas slider, the always-on AI rail). Public
 *  viewers get a single stand-alone viewer experience. They can sign
 *  in via the public banner if they want the full app.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapShell, BrandZone, type CustomerBrand } from '../components/MapShell'

interface PublicSiteResponse {
  id: string
  slug: string
  name: string
  description: string | null
  storage_srid: number
  is_public_pre_login: boolean
  center?: { longitude: number; latitude: number }
  layers?: unknown[]
  [k: string]: unknown
}

interface PublicSettings {
  login_splash_title?: string
  login_splash_subtitle?: string
  org_name?: string
  logo_url?: string
}

export default function PublicViewerPage() {
  const { siteSlug } = useParams<{ siteSlug: string }>()
  const [site, setSite] = useState<PublicSiteResponse | null>(null)
  const [settings, setSettings] = useState<PublicSettings>({})
  const [activeToolId, setActiveToolId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [is2D, setIs2D] = useState(false)
  const [headingDeg, setHeadingDeg] = useState(0)

  // Fetch public site + branding settings on mount.
  useEffect(() => {
    if (!siteSlug) return
    let cancelled = false

    Promise.all([
      fetch(`/api/public/sites/${encodeURIComponent(siteSlug)}`),
      fetch('/api/public/settings'),
    ])
      .then(async ([siteR, settingsR]) => {
        if (cancelled) return
        if (siteR.status === 404) {
          setError('This site is not available publicly.')
          return
        }
        if (!siteR.ok) {
          setError(`Site fetch failed (${siteR.status})`)
          return
        }
        setSite(await siteR.json())
        if (settingsR.ok) setSettings(await settingsR.json())
      })
      .catch((e: Error) => !cancelled && setError(e.message))

    return () => {
      cancelled = true
    }
  }, [siteSlug])

  if (error) {
    return (
      <div style={fullscreenStyle}>
        <div style={{ maxWidth: 480, color: '#fca5a5', textAlign: 'center' }}>
          <h2 style={{ margin: '0 0 12px' }}>{error}</h2>
          <a href="/" style={{ color: '#a78bfa', fontSize: 13 }}>
            Sign in to MightyTwin
          </a>
        </div>
      </div>
    )
  }

  if (!site) {
    return <div style={fullscreenStyle}>Loading…</div>
  }

  // Customer branding pulled from settings; falls back to MightyTwin
  // primary if no customer is configured.
  const customer: CustomerBrand | null = settings.org_name
    ? {
        name: settings.org_name,
        initials: settings.org_name.slice(0, 2).toUpperCase(),
        gradient: ['#f97316', '#ef4444'],
      }
    : null

  // Widget action handler — sets active tool. Real wiring (firing the
  // widget popup, fetching layers, etc.) plugs in once the regular
  // viewer adopts MapShell too.
  const onAction = (id: string) => setActiveToolId((cur) => (cur === id ? null : id))

  return (
    <div style={fullscreenStyle}>
      {/* Top bar — brand + site title only (no layout slider in public mode) */}
      <header
        style={{
          height: 52,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 16px',
          background: 'rgba(15,15,20,0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}
      >
        <BrandZone customer={customer} />
        <div style={{ flex: 1 }} />
        <a
          href="/"
          style={{
            padding: '6px 14px',
            borderRadius: 8,
            background: 'rgba(36,83,255,0.16)',
            border: '1px solid rgba(36,83,255,0.32)',
            color: '#fff',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            textDecoration: 'none',
          }}
        >
          Sign in
        </a>
      </header>

      {/* Map surface */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#0a0c14' }}>
        {/* Cesium globe placeholder (the real viewer wires in once the
            regular viewer adopts MapShell — Phase M ships chrome + the
            data plumbing; Cesium swap-in is the very next commit). */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(circle at 30% 30%, rgba(45,212,191,0.16), transparent 50%), radial-gradient(circle at 70% 70%, rgba(99,102,241,0.13), transparent 55%), linear-gradient(180deg, #1a1d28 0%, #0d1018 100%)',
          }}
        />
        <MapShell
          site={{
            slug: site.slug,
            name: site.name,
            subtitle: site.description ?? undefined,
          }}
          activeToolId={activeToolId}
          onAction={onAction}
          onZoomIn={() => {}}
          onZoomOut={() => {}}
          onHome={() => {}}
          onToggle2D3D={() => setIs2D((v) => !v)}
          onToggleBasemap={() => {}}
          onResetCamera={() => setHeadingDeg(0)}
          publicMode={true}
          showPublicBanner={true}
          headingDeg={headingDeg}
          is2D={is2D}
        />
      </div>
    </div>
  )
}

const fullscreenStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  background: '#0a0c14',
  color: '#f0f2f8',
}
