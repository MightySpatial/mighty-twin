import { Settings, LogOut, Eye, EyeOff, ExternalLink } from 'lucide-react'

interface SiteListItem {
  id: string
  name: string
  slug: string
  layer_count: number
}

interface LayerData {
  id: string
  name: string
  type: string
  visible: boolean
}

interface SiteData {
  layers: LayerData[]
}

interface User {
  role: string
}

interface SlideMenuProps {
  sites: SiteListItem[]
  siteSlug: string | undefined
  site: SiteData | null
  layerStates: Record<string, boolean>
  user: User | null
  onClose: () => void
  onNavigate: (slug: string) => void
  onLayerToggle: (layerId: string) => void
  onLogout: () => void
}

const SITE_COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#f87171', '#a78bfa', '#2dd4bf']

export default function SlideMenu({
  sites, siteSlug, site, layerStates, user,
  onClose, onNavigate, onLayerToggle, onLogout,
}: SlideMenuProps) {
  return (
    <>
      <div className="menu-backdrop" onClick={onClose} />
      <div className="slide-menu">
        <div className="menu-section">
          <h3>Sites</h3>
          {sites.length === 0 && <p className="menu-hint">No sites configured</p>}
          {sites.map((s, i) => {
            const color = SITE_COLORS[i % SITE_COLORS.length]
            const isActive = siteSlug === s.slug
            return (
              <button
                key={s.id}
                className={`menu-site-card${isActive ? ' active' : ''}`}
                onClick={() => onNavigate(s.slug)}
              >
                <span className="menu-site-dot" style={{ background: color }} />
                <span className="menu-site-name">{s.name}</span>
                <span className="menu-site-count">{s.layer_count} layer{s.layer_count !== 1 ? 's' : ''}</span>
              </button>
            )
          })}
        </div>

        {site && site.layers.length > 0 && (
          <div className="menu-section">
            <h3>Layers</h3>
            {site.layers.map(layer => {
              const checked = layerStates[layer.id] ?? layer.visible
              return (
                <label key={layer.id} className={`menu-layer-row${checked ? '' : ' menu-layer-row--off'}`}>
                  <button className="menu-layer-vis" onClick={(e) => { e.preventDefault(); onLayerToggle(layer.id) }}>
                    {checked ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <span className="menu-layer-name">{layer.name}</span>
                  <span className="layer-type-badge">{layer.type}</span>
                </label>
              )
            })}
          </div>
        )}

        <div className="menu-section menu-section--footer">
          {user?.role === 'admin' && (
            <button className="menu-item" onClick={() => window.open('/admin', '_blank')}>
              <Settings size={16} />
              <span>Admin Dashboard</span>
              <ExternalLink size={12} className="menu-item-external" />
            </button>
          )}
          <button className="menu-item menu-item-danger" onClick={onLogout}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </div>
    </>
  )
}
