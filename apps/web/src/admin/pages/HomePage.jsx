import { useNavigate } from 'react-router-dom'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useApiData } from '../hooks/useApi'
import { Users, MapPin, Database, Upload, Settings, ChevronRight, Loader } from 'lucide-react'
import '../styles/components.css'
import './HomePage.css'

function formatBytes(b) {
  if (!b) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(1024))
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const QUICK_ACTIONS = [
  { icon: Users,    label: 'Invite User', path: '/admin/users/new' },
  { icon: MapPin,   label: 'Add Site',    path: '/admin/sites/new' },
  { icon: Upload,   label: 'Upload',      path: '/admin/upload' },
  { icon: Settings, label: 'Settings',    path: '/admin/settings' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { isDesktop } = useBreakpoint()
  // Real stats from API
  const { data: users,   loading: usersLoading   } = useApiData('/api/auth/users',           [])
  const { data: sites,   loading: sitesLoading   } = useApiData('/api/spatial/sites',         [])
  const { data: sources, loading: sourcesLoading } = useApiData('/api/spatial/data-sources',  [])

  const totalBytes = (sources || []).reduce((s, ds) => s + (ds.size || 0), 0)
  const loading = usersLoading || sitesLoading || sourcesLoading

  const stats = [
    { key: 'users',   value: usersLoading   ? null : (users   || []).length, label: 'Users',        path: '/admin/users' },
    { key: 'sites',   value: sitesLoading   ? null : (sites   || []).length, label: 'Sites',        path: '/admin/sites' },
    { key: 'storage', value: sourcesLoading ? null : formatBytes(totalBytes), label: 'Storage Used', path: '/admin/data' },
  ]

  // Health check
  const { data: health } = useApiData('/health', null)
  const apiOk = health?.status === 'healthy' || health?.status === 'ok'

  const systemStatus = [
    { name: 'API',      ok: apiOk !== false },
    { name: 'Database', ok: apiOk !== false }, // if API is up, DB is up (FastAPI fails without it)
  ]

  return (
    <div className="home-page">
      {isDesktop && (
        <header className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Welcome back
          </p>
        </header>
      )}

      {/* Stats */}
      <section className="section">
        <div className="stats-grid home-stats">
          {stats.map(stat => (
            <div
              key={stat.key}
              className="stat-card"
              onClick={() => navigate(stat.path)}
            >
              {stat.value === null
                ? <Loader size={22} className="spin" style={{ opacity: 0.4 }} />
                : <span className="stat-value">{stat.value}</span>}
              <span className="stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section className="section">
        <h2 className="section-title">Quick Actions</h2>
        <div className="quick-actions-grid">
          {QUICK_ACTIONS.map((action, i) => (
            <button
              key={i}
              className="quick-action-btn"
              onClick={() => navigate(action.path)}
            >
              <action.icon size={24} />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="home-bottom-grid">
        {/* Recent Data Sources */}
        <section className="section">
          <h2 className="section-title">Recent Uploads</h2>
          {sourcesLoading
            ? <div style={{ padding: '1rem', opacity: 0.4, textAlign: 'center' }}><Loader size={18} className="spin" /></div>
            : (sources || []).length === 0
              ? <p className="empty-state-hint">No data uploaded yet.</p>
              : (
                <div className="activity-list">
                  {[...(sources || [])].slice(-5).reverse().map(ds => (
                    <div key={ds.id} className="activity-item" style={{ cursor: 'pointer' }} onClick={() => navigate('/admin/data')}>
                      <span className="activity-icon">
                        {ds.type === 'ifc' ? '🏗️' : ds.type === 'raster' ? '🗺️' : ds.type === 'pointcloud' ? '☁️' : '📍'}
                      </span>
                      <div className="activity-content">
                        <span className="activity-text">{ds.name}</span>
                        <span className="activity-time">
                          {ds.format?.toUpperCase() || ds.type} · {formatBytes(ds.size)}
                          <span className={`status-badge ${ds.status === 'ready' ? 'status-active' : 'status-pending'}`} style={{ marginLeft: 6 }}>
                            {ds.status}
                          </span>
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          <button className="btn btn-ghost btn-full activity-view-all" onClick={() => navigate('/admin/data')}>
            View Data Store
            <ChevronRight size={18} />
          </button>
        </section>

        {/* System Status */}
        <section className="section">
          <h2 className="section-title">System Status</h2>
          <div className="status-list">
            {systemStatus.map((item, i) => (
              <div key={i} className="status-item">
                <span className="status-name">{item.name}</span>
                <span className={`status-badge ${item.ok ? 'status-active' : 'status-error'}`}>
                  {item.ok ? 'Online' : 'Error'}
                </span>
              </div>
            ))}
            <div className="status-item">
              <span className="status-name">Sites</span>
              <span className="status-badge status-active">
                {(sites || []).length} active
              </span>
            </div>
            <div className="status-item">
              <span className="status-name">Data Sources</span>
              <span className="status-badge status-active">
                {(sources || []).filter(ds => ds.status === 'ready').length} ready
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
