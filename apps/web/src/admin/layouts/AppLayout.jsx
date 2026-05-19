import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useShellContext } from '@mightyspatial/app-shell'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { apiFetch } from '../hooks/useApi'
import { LayoutDashboard, MapPin, Database, FolderOpen, Upload, Inbox, BookOpen, Camera, Radio } from 'lucide-react'
import './AppLayout.css'

/** Atlas nav items, grouped for the desktop sidebar. Phone bottom-nav
 *  flattens to a single horizontal strip (groups don't fit there).
 *  Order preserves the previous flat layout; groups are added on top. */
const NAV_ITEMS = [
  // Workspace — where the user navigates the workspace itself.
  { path: '/admin/overview', icon: LayoutDashboard, label: 'Overview', group: 'Workspace' },
  { path: '/admin/sites', icon: MapPin, label: 'Sites', group: 'Workspace' },
  // Data — sources, ingest, holding.
  { path: '/admin/data', icon: Database, label: 'Data', group: 'Data' },
  { path: '/admin/feeds', icon: Radio, label: 'Feeds', group: 'Data' },
  { path: '/admin/upload', icon: Upload, label: 'Upload', group: 'Data' },
  { path: '/admin/library', icon: FolderOpen, label: 'Library', group: 'Data' },
  { path: '/admin/submissions', icon: Inbox, label: 'Submissions', badgeKey: 'submissions_pending', group: 'Data' },
  // Content — narrative + captured artefacts.
  { path: '/admin/stories', icon: BookOpen, label: 'Stories', group: 'Content' },
  { path: '/admin/snapshots', icon: Camera, label: 'Snaps', group: 'Content' },
]
const NAV_GROUP_ORDER = ['Workspace', 'Data', 'Content']

/** Atlas layout — the publisher-level chrome. Wraps Sites, Data, Upload,
 *  and Library in a sidebar (desktop) / drawer (tablet) / bottom-tab
 *  (phone) shell. Users, Tools, Integrations, and system settings have
 *  moved to the top-level Settings tab. */
export default function AppLayout() {
  const { layoutMode } = useBreakpoint()
  // Phase 3 pivot — branch on layoutMode, not breakpoint:
  //   phone           → bottom carousel
  //   tabletPortrait  → bottom carousel (was: tablet drawer; retired)
  //   tabletLandscape → left sidebar  (matches desktop)
  //   desktop         → left sidebar
  const showBottomNav = layoutMode === 'phone' || layoutMode === 'tabletPortrait'
  const showSidebar = layoutMode === 'tabletLandscape' || layoutMode === 'desktop'
  const showPhoneHeader = layoutMode === 'phone' || layoutMode === 'tabletPortrait'
  // setMode reserved for shell-driven layout overrides — not used here yet,
  // pulling from useShellContext keeps the import intact for the badge poll.
  useShellContext()
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
    <div className={`app-layout${showBottomNav ? ' is-phone' : ''}`}>
      {/* ═══ SIDEBAR — desktop + tablet landscape ═══ */}
      {showSidebar && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <span className="logo-icon">⬡</span>
              <span className="logo-text">Atlas</span>
            </div>
          </div>

          {/* Quick search affordance — ⌘K opens the command palette
              mounted at AdminRoot. Click also opens it via a synthetic
              keydown so trackpad-first users have a discoverable path. */}
          <button
            type="button"
            className="sidebar-cmdk"
            onClick={() => {
              window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', metaKey: true }),
              )
            }}
          >
            <span className="sidebar-cmdk-icon">⌕</span>
            <span className="sidebar-cmdk-label">Quick jump…</span>
            <span className="sidebar-cmdk-kbd">⌘K</span>
          </button>

          <nav className="sidebar-nav">
            {NAV_GROUP_ORDER.map(group => {
              const itemsInGroup = NAV_ITEMS.filter(i => i.group === group)
              if (itemsInGroup.length === 0) return null
              return (
                <div key={group} className="nav-section">
                  <span className="nav-section-title">{group}</span>
                  {itemsInGroup.map(item => (
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
              )
            })}
          </nav>
        </aside>
      )}

      {/* The legacy `isTablet` drawer was retired in Phase 3 — tablet
          portrait now uses the phone bottom carousel; tablet landscape
          uses the desktop sidebar above. */}

      {/* ═══ MAIN CONTENT AREA ═══ */}
      <div className="main-wrapper">
        {showPhoneHeader && (
          <header className="header header-phone">
            <h1 className="header-title">{getPageTitle()}</h1>
          </header>
        )}

        <main className="main-content">
          <Outlet />
        </main>

        {/* Bottom Nav — phone + tablet portrait. Horizontal scrollable
            carousel of all sections. Earlier shipped a 5-tab cap +
            "More" sheet, which hid half the nav and forced an extra
            tap; the scroller keeps every tab one flick away. Snap so
            flicks settle on a tab boundary, scrollbar hidden so it
            reads as a tabbar. */}
        {showBottomNav && (
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
