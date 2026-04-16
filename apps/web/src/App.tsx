import { AppShell } from '@mightyspatial/app-shell'
import { SettingsShell, usePersistedSettings } from '@mightyspatial/settings-panels'
import { AuthProvider } from './viewer/hooks/useAuth'
import { ToastProvider } from './viewer/hooks/useToast'
import { ViewerRoot } from './viewer/ViewerRoot'
import { AdminRoot } from './admin/AdminRoot'

/** mighty-twin's entry component. The shell owns the chrome (top bar,
 *  split-pane mechanics, breakpoint detection, settings tab); this file
 *  just wires the viewer + admin slots to the lifted v1 code.
 *
 *  AuthProvider and ToastProvider wrap the whole shell so that both
 *  panes share auth state and toast stack. In v1 these lived inside
 *  the viewer app only; admin used `localStorage.accessToken` directly.
 *  Hoisting them means a single login persists across tabs. */
export function App() {
  const { settings } = usePersistedSettings()
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell
          brand={{ name: 'MightyTwin' }}
          viewer={<ViewerRoot />}
          adminContent={<AdminRoot />}
          settingsContent={<SettingsShell />}
          showDeveloperTools={settings.dev.enabled}
        />
      </ToastProvider>
    </AuthProvider>
  )
}
