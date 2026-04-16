import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useApiData, apiFetch } from '../hooks/useApi'
import { Search, Upload, ChevronRight, Loader, AlertCircle, Trash2 } from 'lucide-react'
import '../styles/components.css'
import './ListPage.css'
import './DataPage.css'

// Type → display label + icon mapping
const TYPE_META = {
  vector:     { label: 'Vector',    icon: '📍' },
  raster:     { label: 'Raster',    icon: '🗺️' },
  '3d-tiles': { label: '3D Tiles',  icon: '🏗️' },
  ifc:        { label: 'IFC',       icon: '🏗️' },
  pointcloud: { label: 'Point Cloud', icon: '☁️' },
  splat:      { label: 'Splat',     icon: '✨' },
}

const STATUS_BADGE = {
  ready:      'status-active',
  processing: 'status-pending',
  uploading:  'status-pending',
  error:      'status-error',
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

const FILTERS = ['All', 'Vector', 'Raster', '3D Tiles', 'IFC', 'Point Cloud', 'Splat']

export default function DataPage() {
  const navigate = useNavigate()
  const { isDesktop } = useBreakpoint()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const [deleting, setDeleting] = useState(null)

  const { data: sources, loading, error, reload } = useApiData('/api/spatial/data-sources', [])

  const filteredData = useMemo(() => {
    return (sources || []).filter(ds => {
      const meta = TYPE_META[ds.type] || { label: ds.type }
      const matchesSearch = ds.name.toLowerCase().includes(search.toLowerCase())
      const matchesFilter = activeFilter === 'All' || meta.label === activeFilter
      return matchesSearch && matchesFilter
    })
  }, [sources, search, activeFilter])

  const totalBytes = useMemo(() =>
    (sources || []).reduce((sum, ds) => sum + (ds.size || 0), 0),
    [sources]
  )

  const handleDelete = async (e, ds) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${ds.name}"? This cannot be undone.`)) return
    setDeleting(ds.id)
    try {
      await apiFetch(`/api/spatial/data-sources/${ds.id}`, { method: 'DELETE' })
      reload()
    } catch (err) {
      alert(`Failed to delete: ${err.message}`)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="list-page">
      {/* Desktop header */}
      {isDesktop && (
        <header className="page-header page-header-with-action">
          <div>
            <h1 className="page-title">Data Store</h1>
            <p className="page-subtitle">
              {loading
                ? 'Loading…'
                : `${(sources || []).length} data sources • ${formatBytes(totalBytes)} total`}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/admin/upload')}>
            <Upload size={20} />
            Upload
          </button>
        </header>
      )}

      {/* Error */}
      {error && (
        <div className="inline-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={reload}>Retry</button>
        </div>
      )}

      {/* Search + filter chips */}
      <div className="list-toolbar">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search data sources…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {loading && <Loader size={18} className="spin" style={{ flexShrink: 0, opacity: 0.5 }} />}
      </div>

      <div className="filter-section">
        <div className="chip-list">
          {FILTERS.map(f => (
            <button
              key={f}
              className={`chip ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isDesktop ? (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Format</th>
                <th>Size</th>
                <th>Features</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(ds => {
                const meta = TYPE_META[ds.type] || { label: ds.type, icon: '📄' }
                return (
                  <tr key={ds.id} onClick={() => navigate(`/admin/data/${ds.id}`)}>
                    <td>
                      <div className="table-user-cell">
                        <span>{meta.icon}</span>
                        <span>{ds.name}</span>
                      </div>
                    </td>
                    <td>{meta.label}</td>
                    <td className="text-secondary">{ds.format || '—'}</td>
                    <td className="text-secondary">{formatBytes(ds.size)}</td>
                    <td className="text-secondary">
                      {ds.feature_count != null ? ds.feature_count.toLocaleString() : '—'}
                    </td>
                    <td>
                      <span className={`status-badge ${STATUS_BADGE[ds.status] || ''}`}>
                        {ds.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-ghost btn-icon"
                        title="Delete"
                        disabled={deleting === ds.id}
                        onClick={e => handleDelete(e, ds)}
                      >
                        {deleting === ds.id
                          ? <Loader size={16} className="spin" />
                          : <Trash2 size={16} />}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!loading && filteredData.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-secondary" style={{ textAlign: 'center', padding: '2rem' }}>
                    {search || activeFilter !== 'All'
                      ? 'No data sources match your filter.'
                      : 'No data sources yet. Upload one to get started.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card-list">
          {filteredData.map(ds => {
            const meta = TYPE_META[ds.type] || { label: ds.type, icon: '📄' }
            return (
              <div
                key={ds.id}
                className="card card-interactive list-card"
                onClick={() => navigate(`/admin/data/${ds.id}`)}
              >
                <div className="data-card-icon">{meta.icon}</div>
                <div className="list-card-content">
                  <span className="list-card-title">{ds.name}</span>
                  <span className="list-card-subtitle">
                    {meta.label} • {formatBytes(ds.size)}
                    {ds.feature_count != null ? ` • ${ds.feature_count.toLocaleString()} features` : ''}
                  </span>
                </div>
                <span className={`status-badge ${STATUS_BADGE[ds.status] || ''}`} style={{ flexShrink: 0 }}>
                  {ds.status}
                </span>
                <ChevronRight size={20} className="list-card-chevron" />
              </div>
            )
          })}
          {!loading && filteredData.length === 0 && (
            <p className="empty-state-hint">
              {search || activeFilter !== 'All' ? 'No matches.' : 'No data sources yet.'}
            </p>
          )}
        </div>
      )}

      {/* FAB (mobile) */}
      {!isDesktop && (
        <button className="fab fab-br" onClick={() => navigate('/admin/upload')}>
          <Upload size={24} />
        </button>
      )}
    </div>
  )
}
