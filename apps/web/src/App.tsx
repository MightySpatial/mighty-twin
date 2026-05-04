import { lazy, Suspense } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@mightyspatial/app-shell'
import { SettingsShell, usePersistedSettings } from '@mightyspatial/settings-panels'
import { useAuth } from './viewer/hooks/useAuth'
import { ViewerRoot } from './viewer/ViewerRoot'
import { AdminRoot } from './admin/AdminRoot'
import UsersPage from './admin/pages/UsersPage'
import SystemSettingsPage from './admin/pages/SystemSettingsPage'
import AISettings from './ai/AISettings'
import ChatPanel from './ai/ChatPanel'

const LoginPage = lazy(() => import('./viewer/pages/LoginPage'))
const PublicViewerPage = lazy(() => import('./viewer/pages/PublicViewerPage'))

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
  { id: 'ai', label: 'AI', panel: <AISettings /> },
  { id: 'users', label: 'Users', panel: <UsersPage /> },
  { id: 'system', label: 'System', panel: <SystemSettingsPage /> },
]

/** Auth gate: when not authenticated, the entire screen is the login
 *  page — no shell chrome, no tab strip, no breakpoint toggles. Users
 *  can't discover the app structure until they log in. Once authenticated,
 *  the full shell renders with Atlas + Viewer + Settings panes. */
export function App() {
  const { isAuthenticated, isLoading } = useAuth()
  const { settings } = usePersistedSettings()
  const location = useLocation()

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

  if (isLoading) return loadingFallback

  if (!isAuthenticated) {
    return (
      <Suspense fallback={loadingFallback}>
        <LoginPage />
      </Suspense>
    )
  }

  return (
    <AppShell
      brand={{ name: 'MightyTwin' }}
      viewer={<ViewerRoot />}
      adminContent={<AdminRoot />}
      settingsContent={<SettingsShell extraSections={TWIN_SETTINGS_SECTIONS} />}
      tabLabels={{ viewer: 'Map', admin: 'Atlas' }}
      showDeveloperTools={settings.dev.enabled}
      rightRail={<ChatPanel />}
    />
  )
}
