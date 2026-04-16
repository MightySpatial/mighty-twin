import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import './styles/global.css'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const OverviewRouter = lazy(() => import('./pages/OverviewRouter'))
const SitesMapPage = lazy(() => import('./pages/SitesMapPage'))
const ViewerPage = lazy(() => import('./pages/ViewerPage'))

const fallback = (
  <div
    style={{
      height: '100%',
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

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return fallback
  if (!isAuthenticated) return <Navigate to="/viewer/login" replace />
  return <>{children}</>
}

/** Renders the viewer pane's internal routes. Mounted inside AppShell's
 *  `viewer` slot, which is always present in the DOM regardless of which
 *  view mode is active (the shell just clips it via CSS). Deep routes
 *  like /viewer/site/:siteSlug are the active state; /viewer/login is
 *  the logged-out state. */
export function ViewerRoot() {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/viewer/login" element={<LoginPage />} />
        <Route path="/viewer/auth/callback" element={<Navigate to="/viewer" replace />} />
        <Route
          path="/viewer"
          element={
            <ProtectedRoute>
              <OverviewRouter />
            </ProtectedRoute>
          }
        />
        <Route
          path="/viewer/sites"
          element={
            <ProtectedRoute>
              <SitesMapPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/viewer/site/:siteSlug"
          element={
            <ProtectedRoute>
              <ViewerPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  )
}
