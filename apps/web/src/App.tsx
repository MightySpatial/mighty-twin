import { lazy, Suspense } from 'react'
import { AppShell } from '@mightyspatial/app-shell'
import { SettingsShell, usePersistedSettings } from '@mightyspatial/settings-panels'
import { useAuth } from './viewer/hooks/useAuth'
import { ViewerRoot } from './viewer/ViewerRoot'
import { AdminRoot } from './admin/AdminRoot'
import UsersPage from './admin/pages/UsersPage'
import SystemSettingsPage from './admin/pages/SystemSettingsPage'

const LoginPage = lazy(() => import('./viewer/pages/LoginPage'))

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
    />
  )
}
