import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useBreakpoint } from '../hooks/useBreakpoint'
import {
  Home, Users, MapPin, Database, FolderOpen, Settings,
  Menu, X, LogOut, Map as MapIcon, ChevronRight, MoreHorizontal,
  Wrench, Plug
} from 'lucide-react'
import './AppLayout.css'

const NAV_ITEMS = [
  { path: '/admin', icon: Home, label: 'Home' },
  { path: '/admin/sites', icon: MapPin, label: 'Sites' },
  { path: '/admin/data', icon: Database, label: 'Data' },
  { path: '/admin/library', icon: FolderOpen, label: 'Library' },
]

const MORE_ITEMS = [
  { path: '/admin/tools', icon: Wrench, label: 'Tools' },
  { path: '/admin/integrations', icon: Plug, label: 'Integrations' },
  { path: '/admin/users', icon: Users, label: 'Users' },
  { path: '/admin/settings', icon: Settings, label: 'Settings' },
]

export default function AppLayout() {
  const { isPhone, isTablet, isDesktop } = useBreakpoint()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const location = useLocation()

  // Get current page title
  const getPageTitle = () => {
    const allItems = [...NAV_ITEMS, ...MORE_ITEMS]
    const current = allItems.find(item => item.path === location.pathname)
    return current?.label || 'Admin'
  }

  return (
    <div className="app-layout">
      {/* ═══ DESKTOP SIDEBAR ═══ */}
      {isDesktop && (
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <span className="logo-icon">⬡</span>
              <span className="logo-text">MightyTwin</span>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section">
              <span className="nav-section-title">Main</span>
              {NAV_ITEMS.map(item => (
                <NavLink 
                  key={item.path} 
                  to={item.path} 
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>

            <div className="nav-section">
              <span className="nav-section-title">Admin</span>
              {MORE_ITEMS.map(item => (
                <NavLink 
                  key={item.path} 
                  to={item.path} 
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="sidebar-footer">
            <button className="nav-link">
              <MapIcon size={20} />
              <span>Go to Viewer</span>
            </button>
            <button className="nav-link nav-link-danger">
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        </aside>
      )}

      {/* ═══ TABLET SIDEBAR (collapsible) ═══ */}
      {isTablet && (
        <>
          <aside className={`sidebar sidebar-tablet ${sidebarOpen ? 'open' : ''}`}>
            <div className="sidebar-header">
              <div className="sidebar-logo">
                <span className="logo-icon">⬡</span>
                <span className="logo-text">MightyTwin</span>
              </div>
              <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <nav className="sidebar-nav">
              {[...NAV_ITEMS, ...MORE_ITEMS].map(item => (
                <NavLink 
                  key={item.path} 
                  to={item.path} 
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon size={20} />
                  <span>{item.label}</span>
                  <ChevronRight size={18} className="nav-link-chevron" />
                </NavLink>
              ))}
            </nav>

            <div className="sidebar-footer">
              <button className="nav-link">
                <MapIcon size={20} />
                <span>Go to Viewer</span>
              </button>
              <button className="nav-link nav-link-danger">
                <LogOut size={20} />
                <span>Logout</span>
              </button>
            </div>
          </aside>
          {sidebarOpen && (
            <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
          )}
        </>
      )}

      {/* ═══ MAIN CONTENT AREA ═══ */}
      <div className="main-wrapper">
        {/* Header (tablet) */}
        {isTablet && (
          <header className="header header-tablet">
            <button className="header-menu-btn" onClick={() => setSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h1 className="header-title">{getPageTitle()}</h1>
            <div className="header-spacer" />
          </header>
        )}

        {/* Header (phone) */}
        {isPhone && (
          <header className="header header-phone">
            <h1 className="header-title">{getPageTitle()}</h1>
          </header>
        )}

        {/* Page Content */}
        <main className="main-content">
          <Outlet />
        </main>

        {/* Bottom Nav (phone only) */}
        {isPhone && (
          <nav className="bottom-nav">
            {NAV_ITEMS.map(item => (
              <NavLink 
                key={item.path} 
                to={item.path} 
                className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
              >
                <item.icon size={24} />
                <span>{item.label}</span>
              </NavLink>
            ))}
            <button 
              className={`bottom-nav-item ${moreOpen ? 'active' : ''}`}
              onClick={() => setMoreOpen(true)}
            >
              <MoreHorizontal size={24} />
              <span>More</span>
            </button>
          </nav>
        )}

        {/* More Sheet (phone only) */}
        {isPhone && moreOpen && (
          <>
            <div className="sheet-backdrop" onClick={() => setMoreOpen(false)} />
            <div className="sheet">
              <div className="sheet-handle" />
              <div className="menu-list">
                {MORE_ITEMS.map(item => (
                  <NavLink 
                    key={item.path} 
                    to={item.path} 
                    className="menu-item"
                    onClick={() => setMoreOpen(false)}
                  >
                    <span className="menu-item-icon"><item.icon size={20} /></span>
                    <span className="menu-item-label">{item.label}</span>
                    <ChevronRight size={18} className="menu-item-chevron" />
                  </NavLink>
                ))}
                <button className="menu-item">
                  <span className="menu-item-icon"><MapIcon size={20} /></span>
                  <span className="menu-item-label">Go to Viewer</span>
                </button>
                <button className="menu-item menu-item-danger">
                  <span className="menu-item-icon"><LogOut size={20} /></span>
                  <span className="menu-item-label">Logout</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
