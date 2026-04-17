import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import SitesPage from './pages/SitesPage'
import SiteNewPage from './pages/SiteNewPage'
import SiteDetailPage from './pages/SiteDetailPage'
import DataPage from './pages/DataPage'
import DataSourcePage from './pages/DataSourcePage'
import UploadPage from './pages/UploadPage'
import LibraryPage from './pages/LibraryPage'
import './styles/components.css'
import './styles/global.css'

/** Atlas pane — publisher-level routes only (Sites, Data, Upload,
 *  Library). Users, Tools, Integrations, and settings-like pages are
 *  handled by the shell's Settings tab instead. */
export function AdminRoot() {
  return (
    <div className="admin-root">
      <Routes>
        <Route path="/admin" element={<AppLayout />}>
          {/* Landing: go straight to Sites, no dashboard */}
          <Route index element={<Navigate to="/admin/sites" replace />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="sites/new" element={<SiteNewPage />} />
          <Route path="sites/:slug" element={<SiteDetailPage />} />
          <Route path="data" element={<DataPage />} />
          <Route path="data/:id" element={<DataSourcePage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="library" element={<LibraryPage />} />
        </Route>
      </Routes>
    </div>
  )
}
