import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import OverviewPage from './pages/OverviewPage'
import SitesPage from './pages/SitesPage'
import SiteNewPage from './pages/SiteNewPage'
import SiteDetailPage from './pages/SiteDetailPage'
import SiteAddLayerPage from './pages/SiteAddLayerPage'
import DataPage from './pages/DataPage'
import DataSourcePage from './pages/DataSourcePage'
import UploadPage from './pages/UploadPage'
import LibraryPage from './pages/LibraryPage'
import SubmissionsPage from './pages/SubmissionsPage'
import StoryMapsPage from './pages/StoryMapsPage'
import MySnapshotsPage from './pages/MySnapshotsPage'
import FeedsPage from './pages/FeedsPage'
import './styles/components.css'
import './styles/global.css'

/** Atlas pane — publisher-level routes (Overview, Sites, Data, Library,
 *  Upload, Submissions). Users + system settings live in the shell's
 *  Settings tab. */
export function AdminRoot() {
  return (
    <div className="admin-root">
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
    </div>
  )
}
