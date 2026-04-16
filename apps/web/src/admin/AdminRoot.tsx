import { Routes, Route } from 'react-router-dom'
import AppLayout from './layouts/AppLayout'
import HomePage from './pages/HomePage'
import UsersPage from './pages/UsersPage'
import SitesPage from './pages/SitesPage'
import DataPage from './pages/DataPage'
import LibraryPage from './pages/LibraryPage'
import SettingsPage from './pages/SettingsPage'
import IntegrationsPage from './pages/IntegrationsPage'
import ToolsPage from './pages/ToolsPage'
import UploadPage from './pages/UploadPage'
import SiteDetailPage from './pages/SiteDetailPage'
import SiteNewPage from './pages/SiteNewPage'
import DataSourcePage from './pages/DataSourcePage'
import UserNewPage from './pages/UserNewPage'
import SetupPage from './pages/SetupPage'
import ApiKeysPage from './pages/ApiKeysPage'
import SystemSettingsPage from './pages/SystemSettingsPage'
import './styles/components.css'
import './styles/global.css'

/** Renders the admin pane's internal routes. The shell mounts this as
 *  `adminContent` whenever the URL is `/admin` or `/admin/*`. v1 ran
 *  this as a standalone SPA under BrowserRouter basename="/admin"; in
 *  v2 there's a single BrowserRouter at the App.tsx level and the
 *  admin routes declare the `/admin` prefix explicitly. */
export function AdminRoot() {
  return (
    <div className="admin-root">
      <Routes>
        {/* Setup wizard lives outside AppLayout (no sidebar) — matches v1 */}
        <Route path="/admin/setup" element={<SetupPage />} />
        <Route path="/admin" element={<AppLayout />}>
          <Route index element={<HomePage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="users/new" element={<UserNewPage />} />
          <Route path="sites" element={<SitesPage />} />
          <Route path="sites/new" element={<SiteNewPage />} />
          <Route path="sites/:slug" element={<SiteDetailPage />} />
          <Route path="data" element={<DataPage />} />
          <Route path="data/:id" element={<DataSourcePage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/api-keys" element={<ApiKeysPage />} />
          <Route path="settings/system" element={<SystemSettingsPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="tools" element={<ToolsPage />} />
        </Route>
      </Routes>
    </div>
  )
}
