import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '@mightyspatial/app-shell'
import { SettingsShell, usePersistedSettings } from '@mightyspatial/settings-panels'
import { useAuth } from './viewer/hooks/useAuth'
import { ViewerRoot } from './viewer/ViewerRoot'
import { AdminRoot } from './admin/AdminRoot'
import UsersPage from './admin/pages/UsersPage'
import SystemSettingsPage from './admin/pages/SystemSettingsPage'
import DiagnosticsPanel from './admin/pages/DiagnosticsPanel'
import ProfilePanel from './admin/pages/ProfilePanel'
import AISettings from './ai/AISettings'
import { DraggableMai } from './ai/DraggableMai'
import { MaiProvider } from './ai/MaiContext'
import { loadAiPanelVisible } from './ai/storage'
import {
  AutodetectRulesPanel,
  BrandingPanel,
  WidgetLayoutPanel,
} from './admin/pages/EngineSettingsPanels'

const LoginPage = lazy(() => import('./viewer/pages/LoginPage'))
const SetupPage = lazy(() => import('./viewer/pages/SetupPage'))
const PublicViewerPage = lazy(() => import('./viewer/pages/PublicViewerPage'))

const API_URL = import.meta.env.VITE_API_URL || ''

const loadingFallback = (
  <div
    style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f0f14',
      color: 'white',
    }}
  >
    Loading…
  </div>
)

/** Twin-specific sections injected into the shared SettingsShell. These
 *  are server-persisted settings that only apply to MightyTwin (not lite
 *  or dev-web). The shared panels (Basemap, Units, Theme, etc.) render
 *  above these automatically. */
const TWIN_SETTINGS_SECTIONS = [
  // Workspace admin
  { id: 'profile', label: 'Profile', panel: <ProfilePanel /> },
  { id: 'branding', label: 'Branding', panel: <BrandingPanel /> },
  { id: 'users', label: 'Users', panel: <UsersPage /> },
  // Engine
  { id: 'ai', label: 'AI', panel: <AISettings /> },
  { id: 'autodetect', label: 'Autodetect', panel: <AutodetectRulesPanel /> },
  { id: 'widgets', label: 'Widgets', panel: <WidgetLayoutPanel /> },
  { id: 'system', label: 'System', panel: <SystemSettingsPage /> },
  { id: 'diagnostics', label: 'Diagnostics', panel: <DiagnosticsPanel /> },
]

/** Auth gate: when not authenticated, the entire screen is the login
 *  page — no shell chrome, no tab strip, no breakpoint toggles. Users
 *  can't discover the app structure until they log in. Once authenticated,
 *  the full shell renders with Atlas + Viewer + Settings panes. */
export function App() {
  const { isAuthenticated, isLoading } = useAuth()
  const { settings } = usePersistedSettings()
  const location = useLocation()
  const navigate = useNavigate()
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [aiPanelVisible, setAiPanelVisible] = useState(() => loadAiPanelVisible())

  // Re-read whenever the user leaves the settings route (most edits happen
  // there) and on cross-tab storage events. Avoids forcing a full reload
  // after toggling the panel off/on.
  useEffect(() => {
    if (!location.pathname.startsWith('/settings')) {
      setAiPanelVisible(loadAiPanelVisible())
    }
  }, [location.pathname])
  useEffect(() => {
    const onStorage = () => setAiPanelVisible(loadAiPanelVisible())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Probe whether the workspace has been set up yet. Fresh installs
  // have no admin user → /api/setup/status returns is_complete=false →
  // we show the SetupPage instead of LoginPage.
  useEffect(() => {
    let cancelled = false
    fetch(`${API_URL}/api/setup/status`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { is_complete?: boolean } | null) => {
        if (cancelled) return
        setSetupComplete(d?.is_complete !== false)
      })
      .catch(() => {
        if (!cancelled) setSetupComplete(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Phase M: /p/<slug> is the unauthenticated public viewer. Bypass the
  // auth gate entirely — these routes have their own page-level shell.
  const isPublicRoute = location.pathname.startsWith('/p/')
  if (isPublicRoute) {
    return (
      <Suspense fallback={loadingFallback}>
        <Routes>
          <Route path="/p/:siteSlug" element={<PublicViewerPage />} />
        </Routes>
      </Suspense>
    )
  }

  if (isLoading || setupComplete === null) return loadingFallback

  if (!isAuthenticated) {
    if (!setupComplete) {
      return (
        <Suspense fallback={loadingFallback}>
          <SetupPage onDone={() => setSetupComplete(true)} />
        </Suspense>
      )
    }
    return (
      <Suspense fallback={loadingFallback}>
        <LoginPage />
      </Suspense>
    )
  }

  return (
    <MaiProvider>
      <AppShell
        brand={{
          name: 'MightyTwin',
          // Wordmark click → overview. Most-natural escape hatch out
          // of a per-site viewer; route to /viewer which renders
          // SitesMapPage.
          onClick: () => navigate('/viewer'),
        }}
        viewer={<ViewerRoot />}
        adminContent={<AdminRoot />}
        settingsContent={<SettingsShell extraSections={TWIN_SETTINGS_SECTIONS} />}
        tabLabels={{ viewer: 'Map', admin: 'Atlas' }}
        showDeveloperTools={settings.dev.enabled}
        rightRail={null}
      />
      {/* Floating repositionable AI panel — draggable on desktop, FAB+sheet on phone.
          Switches to docked bottom-bar when a viewer widget panel is open. */}
      {aiPanelVisible && <DraggableMai />}
    </MaiProvider>
  )
}
