import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import './styles/global.css'

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

/** Viewer pane routes. Auth is handled at the App level — if this
 *  component renders, the user is already authenticated. No
 *  ProtectedRoute wrapper needed. */
export function ViewerRoot() {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route path="/viewer" element={<OverviewRouter />} />
        <Route path="/viewer/sites" element={<SitesMapPage />} />
        <Route path="/viewer/site/:siteSlug" element={<ViewerPage />} />
        {/* Catch-all: any unmatched /viewer/* path → land on overview */}
        <Route path="/viewer/*" element={<Navigate to="/viewer" replace />} />
      </Routes>
    </Suspense>
  )
}
