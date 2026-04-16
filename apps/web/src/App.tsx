import { AppShell } from '@mightyspatial/app-shell'
import { DevToolsPage } from '@mightyspatial/admin-panels/dev-tools'
import { MockAdminPage } from '@mightyspatial/admin-panels/mock'
import { SettingsShell, usePersistedSettings } from '@mightyspatial/settings-panels'
import { ViewerSurface } from './ViewerSurface'
import { branding } from './branding'

export function App() {
  const { settings } = usePersistedSettings()
  const adminContent =
    settings.admin.view === 'mock' ? <MockAdminPage /> : <DevToolsPage viewer={null} />
  return (
    <AppShell
      brand={{ name: branding.name }}
      viewer={<ViewerSurface />}
      adminContent={adminContent}
      settingsContent={<SettingsShell />}
    />
  )
}
