import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useShellContext } from '@mightyspatial/app-shell'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { apiFetch } from '../hooks/useApi'
import { LayoutDashboard, MapPin, Database, FolderOpen, Upload, Inbox, BookOpen, Camera, Radio, Menu, X, ChevronRight } from 'lucide-react'
import './AppLayout.css'

const NAV_ITEMS = [
  { path: '/admin/overview', icon: LayoutDashboard, label: 'Overview' },
  { path: '/admin/sites', icon: MapPin, label: 'Sites' },
  { path: '/admin/data', icon: Database, label: 'Data' },
  { path: '/admin/feeds', icon: Radio, label: 'Feeds' },
  { path: '/admin/library', icon: FolderOpen, label: 'Library' },
  { path: '/admin/stories', icon: BookOpen, label: 'Stories' },
  { path: '/admin/snapshots', icon: Camera, label: 'Snaps' },
  { path: '/admin/submissions', icon: Inbox, label: 'Submissions', badgeKey: 'submissions_pending' },
  { path: '/admin/upload', icon: Upload, label: 'Upload' },
]

/** Atlas layout — the publisher-level chrome. Wraps Sites, Data, Upload,
 *  and Library in a sidebar (desktop) / drawer (tablet) / bottom-tab
 *  (phone) shell. Users, Tools, Integrations, and system settings have
 *  moved to the top-level Settings tab. */
export default function AppLayout() {
  const { isPhone, isTablet, isDesktop } = useBreakpoint()
  // setMode reserved for shell-driven layout overrides — not used here yet,
  // pulling from useShellContext keeps the import intact for the badge poll.
  useShellContext()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [badges, setBadges] = useState({})
  const location = useLocation()

  // Poll Atlas overview every 60s for badge counts (pending submissions etc).
  // Cheap aggregate read — same endpoint OverviewPage uses, so the cache is
  // shared across the session.
  useEffect(() => {
    let cancelled = false
    const load = () => {
      apiFetch('/api/atlas/overview')
        .then((d) => {
          if (cancelled) return
          setBadges(d?.counts ?? {})
        })
        .catch(() => undefined)
    }
    load()
    const id = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  const getPageTitle = () => {
    const current = NAV_ITEMS.find(item => location.pathname.startsWith(item.path))
    return current?.label || 'Atlas'
  }

  const renderBadge = (item) => {
    if (!item.badgeKey) return null
    const n = badges[item.badgeKey] || 0
    if (!n) return null
    return <span className="nav-badge">{n}</span>
  }

  return (
    <div className="app-layout">
      {/* ═══ DESKTOP SIDEBAR ═══ */}
      {isDesktop && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <span className="logo-icon">⬡</span>
              <span className="logo-text">Atlas</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section">
              <span className="nav-section-title">Publisher</span>
              {NAV_ITEMS.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                  {renderBadge(item)}
                </NavLink>
              ))}
            </div>
          </nav>
        </aside>
      )}

      {/* ═══ TABLET SIDEBAR (drawer) ═══ */}
      {isTablet && (
        <>
          <aside className={`sidebar sidebar-tablet ${sidebarOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
              <div className="sidebar-logo">
                <span className="logo-icon">⬡</span>
                <span className="logo-text">Atlas</span>
              </div>
              <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <nav className="sidebar-nav">
              {NAV_ITEMS.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                  {renderBadge(item)}
                  <ChevronRight size={18} className="nav-link-chevron" />
                </NavLink>
              ))}
            </nav>
          </aside>
          {sidebarOpen && (
            <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          )}
        </>
      )}

      {/* ═══ MAIN CONTENT AREA ═══ */}
      <div className="main-wrapper">
        {isTablet && (
          <header className="header header-tablet">
            <button className="header-menu-btn" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h1 className="header-title">{getPageTitle()}</h1>
            <div className="header-spacer" />
          </header>
        )}

        {isPhone && (
          <header className="header header-phone">
            <h1 className="header-title">{getPageTitle()}</h1>
          </header>
        )}

        <main className="main-content">
          <Outlet />
        </main>

        {/* Bottom Nav (phone only) — 4 items, no More sheet needed */}
        {isPhone && (
          <nav className="bottom-nav">
            {NAV_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="bottom-nav-icon-wrap">
                  <item.icon size={22} />
                  {renderBadge(item)}
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>
        )}
      </div>
    </div>
  )
}
