import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { usePersistedSettings } from '@mightyspatial/settings-panels'
import { AuthProvider } from './viewer/hooks/useAuth'
import { ToastProvider } from './viewer/hooks/useToast'
import './styles.css'
import { App } from './App'

function ThemeAttrs() {
  const { settings } = usePersistedSettings()
  useEffect(() => {
    const el = document.documentElement
    const resolved =
      settings.theme.mode === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : settings.theme.mode
    el.setAttribute('data-theme', resolved)
    el.setAttribute('data-density', settings.theme.density)
  }, [settings.theme.mode, settings.theme.density])
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <ThemeAttrs />
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
