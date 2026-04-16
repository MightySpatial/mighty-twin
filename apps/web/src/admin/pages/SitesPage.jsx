import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useApiData, apiFetch } from '../hooks/useApi'
import { Search, Plus, ChevronRight, MoreVertical, Loader, AlertCircle, Trash2 } from 'lucide-react'
import '../styles/components.css'
import './ListPage.css'

export default function SitesPage() {
  const navigate = useNavigate()
  const { isDesktop } = useBreakpoint()
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)

  const { data: sites, loading, error, reload } = useApiData('/api/spatial/sites', [])

  const filteredSites = (sites || []).filter(site =>
    site.name.toLowerCase().includes(search.toLowerCase()) ||
    (site.description || '').toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = async (e, site) => {
    e.stopPropagation()
    if (!window.confirm(`Delete site "${site.name}"? This will remove all its layers.`)) return
    setDeleting(site.id)
    try {
      await apiFetch(`/api/spatial/sites/${site.slug}`, { method: 'DELETE' })
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
            <h1 className="page-title">Sites</h1>
            <p className="page-subtitle">
              {loading ? 'Loading…' : `${(sites || []).length} sites configured`}
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/admin/sites/new')}>
            <Plus size={20} />
            Add Site
          </button>
        </header>
      )}

      {/* Search */}
      <div className="list-toolbar">
        <div className="search-bar">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search sites…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {loading && <Loader size={18} className="spin" style={{ flexShrink: 0, opacity: 0.5 }} />}
      </div>

      {/* Error */}
      {error && (
        <div className="inline-error">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={reload}>Retry</button>
        </div>
      )}

      {/* Desktop Table */}
      {isDesktop ? (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Site</th>
                <th>Slug</th>
                <th>Description</th>
                <th>Layers</th>
                <th>Public</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.map(site => (
                <tr key={site.id} onClick={() => navigate(`/admin/sites/${site.slug}`)}>
                  <td>
                    <div className="table-user-cell">
                      <span className="site-icon">📍</span>
                      <span>{site.name}</span>
                    </div>
                  </td>
                  <td className="text-secondary" style={{ fontFamily: 'monospace', fontSize: 13 }}>
                    {site.slug}
                  </td>
                  <td className="text-secondary">{site.description || '—'}</td>
                  <td>{site.layer_count ?? 0}</td>
                  <td>
                    <span className={`status-badge ${site.is_public ? 'status-active' : 'status-inactive'}`}>
                      {site.is_public ? 'Public' : 'Private'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-icon"
                      title="Delete site"
                      disabled={deleting === site.id}
                      onClick={e => handleDelete(e, site)}
                    >
                      {deleting === site.id
                        ? <Loader size={16} className="spin" />
                        : <Trash2 size={16} />}
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && filteredSites.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-secondary" style={{ textAlign: 'center', padding: '2rem' }}>
                    {search ? 'No sites match your search.' : 'No sites yet. Create one to get started.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Mobile card list */
        <div className="card-list">
          {filteredSites.map(site => (
            <div
              key={site.id}
              className="card card-interactive list-card"
              onClick={() => navigate(`/admin/sites/${site.slug}`)}
            >
              <div className="site-card-icon">📍</div>
              <div className="list-card-content">
                <span className="list-card-title">{site.name}</span>
                <span className="list-card-subtitle">
                  {site.layer_count ?? 0} layer{site.layer_count !== 1 ? 's' : ''}
                  {site.description ? ` • ${site.description}` : ''}
                </span>
              </div>
              <ChevronRight size={20} className="list-card-chevron" />
            </div>
          ))}
          {!loading && filteredSites.length === 0 && (
            <p className="empty-state-hint">
              {search ? 'No sites match.' : 'No sites yet.'}
            </p>
          )}
        </div>
      )}

      {/* FAB (mobile) */}
      {!isDesktop && (
        <button className="fab fab-br" onClick={() => navigate('/admin/sites/new')}>
          <Plus size={24} />
        </button>
      )}
    </div>
  )
}
