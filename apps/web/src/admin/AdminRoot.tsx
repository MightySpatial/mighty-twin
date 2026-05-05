import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import OverviewPage from './pages/OverviewPage'
import SitesPage from './pages/SitesPage'
import SiteNewPage from './pages/SiteNewPage'
import CommandPalette from './components/CommandPalette'
import './styles/components.css'
import './styles/global.css'

// Hot paths (Overview / Sites / SiteNew) load eagerly so the first
// click after sign-in stays instant. The heavier data-table pages
// (Library, Stories, Submissions, Feeds) and the per-site detail
// pages lazy-split — they're not visited until the user navigates
// there explicitly.
const SiteDetailPage = lazy(() => import('./pages/SiteDetailPage'))
const SiteAddLayerPage = lazy(() => import('./pages/SiteAddLayerPage'))
const DataPage = lazy(() => import('./pages/DataPage'))
const DataSourcePage = lazy(() => import('./pages/DataSourcePage'))
const UploadPage = lazy(() => import('./pages/UploadPage'))
const LibraryPage = lazy(() => import('./pages/LibraryPage'))
const SubmissionsPage = lazy(() => import('./pages/SubmissionsPage'))
const StoryMapsPage = lazy(() => import('./pages/StoryMapsPage'))
const MySnapshotsPage = lazy(() => import('./pages/MySnapshotsPage'))
const FeedsPage = lazy(() => import('./pages/FeedsPage'))

const pageFallback = (
  <div style={{ padding: 24, color: 'rgba(240,242,248,0.5)' }}>Loading…</div>
)

/** Atlas pane — publisher-level routes (Overview, Sites, Data, Library,
 *  Upload, Submissions). Users + system settings live in the shell's
 *  Settings tab. */
export function AdminRoot() {
  return (
    <div className="admin-root">
      <CommandPalette />
      <Suspense fallback={pageFallback}>
        <Routes>
          <Route path="/admin" element={<AppLayout />}>
            <Route index element={<Navigate to="/admin/overview" replace />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="sites" element={<SitesPage />} />
            <Route path="sites/new" element={<SiteNewPage />} />
            <Route path="sites/:slug" element={<SiteDetailPage />} />
            <Route path="sites/:slug/add-layer" element={<SiteAddLayerPage />} />
            <Route path="data" element={<DataPage />} />
            <Route path="data/:id" element={<DataSourcePage />} />
            <Route path="upload" element={<UploadPage />} />
            <Route path="library" element={<LibraryPage />} />
            <Route path="stories" element={<StoryMapsPage />} />
            <Route path="snapshots" element={<MySnapshotsPage />} />
            <Route path="feeds" element={<FeedsPage />} />
            <Route path="submissions" element={<SubmissionsPage />} />
          </Route>
        </Routes>
      </Suspense>
    </div>
  )
}
