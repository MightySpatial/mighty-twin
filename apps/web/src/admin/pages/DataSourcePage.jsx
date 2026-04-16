/**
 * MightyTwin Admin — Data Source Detail Page
 * View data source info and add it to a site as a layer.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApiData, apiFetch } from '../hooks/useApi'
import { ChevronLeft, Plus, Loader, AlertCircle, Trash2, CheckCircle, Table2 } from 'lucide-react'
import { AttributeTable } from '@mightydt/ui'
import '../styles/components.css'
import './SiteDetailPage.css'

const TYPE_META = {
  vector:     { label: 'Vector',      icon: '📍' },
  raster:     { label: 'Raster',      icon: '🗺' },
  '3d-tiles': { label: '3D Tiles',    icon: '🏗' },
  ifc:        { label: 'IFC',         icon: '🏗' },
  pointcloud: { label: 'Point Cloud', icon: '☁' },
  splat:      { label: 'Splat',       icon: '✨' },
}

const LAYER_TYPES = [
  { value: 'vector',   label: 'Vector' },
  { value: 'raster',   label: 'Raster' },
  { value: 'terrain',  label: 'Terrain' },
  { value: '3d-tiles', label: '3D Tiles' },
  { value: 'wms',      label: 'WMS' },
  { value: 'wmts',     label: 'WMTS' },
  { value: 'splat',    label: 'Splat' },
]

function formatBytes(b) {
  if (!b) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(b) / Math.log(1024))
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export default function DataSourcePage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: ds, loading, error } = useApiData(id ? `/api/spatial/data-sources/${id}` : null, null)
  const { data: sites } = useApiData('/api/spatial/sites', [])

  const [selectedSite, setSelectedSite] = useState('')
  const [layerName, setLayerName] = useState('')
  const [layerType, setLayerType] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState(null)
  const [addSuccess, setAddSuccess] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [showAttrTable, setShowAttrTable] = useState(false)

  // Pre-fill layer name and type from data source
  useEffect(() => {
    if (!ds) return
    setLayerName(ds.name || '')
    // Infer layer type from data source type
    const typeMap = { vector: 'vector', raster: 'raster', '3d-tiles': '3d-tiles', ifc: '3d-tiles', pointcloud: 'vector', splat: 'splat' }
    setLayerType(typeMap[ds.type] || 'vector')
  }, [ds])

  const handleAddToSite = async () => {
    if (!selectedSite || !layerName.trim() || !layerType) {
      setAddError('Select a site, layer name, and type.')
      return
    }
    setAdding(true)
    setAddError(null)
    setAddSuccess(null)
    try {
      const site = (sites || []).find(s => s.id === selectedSite)
      await apiFetch(`/api/spatial/sites/${site.slug}/layers`, {
        method: 'POST',
        body: {
          name: layerName.trim(),
          type: layerType,
          data_source_id: id,
          visible: true,
          opacity: 1.0,
          order: 0,
        },
      })
      setAddSuccess(`Added "${layerName}" to ${site.name}`)
    } catch (err) {
      setAddError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${ds?.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await apiFetch(`/api/spatial/data-sources/${id}`, { method: 'DELETE' })
      navigate('/admin/data')
    } catch (err) {
      alert(`Failed: ${err.message}`)
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="site-detail-loading"><Loader size={24} className="spin" /></div>
  )
  if (error || !ds) return (
    <div className="site-detail-error">
      <AlertCircle size={20} />
      <span>{error || 'Data source not found'}</span>
      <button className="btn btn-ghost" onClick={() => navigate('/admin/data')}>
        <ChevronLeft size={16} /> Back
      </button>
    </div>
  )

  const meta = TYPE_META[ds.type] || { label: ds.type, icon: '📄' }

  return (
    <div className="site-detail-page">
      <header className="page-header page-header-with-action">
        <div>
          <button className="btn btn-ghost back-btn" onClick={() => navigate('/admin/data')}>
            <ChevronLeft size={18} /> Data Store
          </button>
          <h1 className="page-title">{ds.name}</h1>
          <p className="page-subtitle">
            <span>{meta.icon} {meta.label}</span>
            <span className="site-slug" style={{ marginLeft: 10 }}>{ds.format?.toUpperCase()}</span>
            <span className={`status-badge ${ds.status === 'ready' ? 'status-active' : 'status-pending'}`} style={{ marginLeft: 8 }}>
              {ds.status}
            </span>
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => setShowAttrTable(true)} title="View Attribute Table">
          <Table2 size={16} /> Attributes
        </button>
        <button className="btn btn-ghost btn-icon" title="Delete" disabled={deleting} onClick={handleDelete}>
          {deleting ? <Loader size={16} className="spin" /> : <Trash2 size={16} />}
        </button>
      </header>

      <div className="site-detail-grid">
        {/* Left: metadata */}
        <div className="site-detail-left">
          <section className="section">
            <h2 className="section-title">File Info</h2>
            <div className="info-rows">
              <div className="info-row"><span className="info-label">Size</span><span>{formatBytes(ds.size)}</span></div>
              <div className="info-row"><span className="info-label">Format</span><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{ds.format || '—'}</span></div>
              <div className="info-row"><span className="info-label">CRS</span><span style={{ fontFamily: 'monospace', fontSize: 13 }}>{ds.crs || '—'}</span></div>
              {ds.feature_count != null && (
                <div className="info-row"><span className="info-label">Features</span><span>{ds.feature_count.toLocaleString()}</span></div>
              )}
            </div>
          </section>

          {ds.url && (
            <section className="section">
              <h2 className="section-title">Storage</h2>
              <code className="url-code">{ds.url}</code>
            </section>
          )}

          {ds.attributes?.length > 0 && (
            <section className="section">
              <h2 className="section-title">Attributes ({ds.attributes.length})</h2>
              <div className="attr-list">
                {ds.attributes.map((attr, i) => (
                  <div key={i} className="attr-row">
                    <span className="attr-name">{typeof attr === 'string' ? attr : attr.name || attr}</span>
                    {attr.type && <span className="attr-type">{attr.type}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right: add to site */}
        <div className="site-detail-right">
          <section className="section">
            <h2 className="section-title">Add to Site</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
              Add this data source as a layer on a site so it appears in the viewer.
            </p>

            {addSuccess && (
              <div className="add-success">
                <CheckCircle size={15} />
                <span>{addSuccess}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  const site = (sites || []).find(s => s.id === selectedSite)
                  if (site) navigate(`/admin/sites/${site.slug}`)
                }}>View site →</button>
              </div>
            )}

            {addError && (
              <div className="inline-error" style={{ marginBottom: 12 }}>
                <AlertCircle size={14} />
                <span>{addError}</span>
              </div>
            )}

            <div className="form-stack">
              <div className="form-field">
                <label className="form-label">Site *</label>
                <select
                  className="form-input"
                  value={selectedSite}
                  onChange={e => setSelectedSite(e.target.value)}
                >
                  <option value="">Select a site…</option>
                  {(sites || []).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label className="form-label">Layer name *</label>
                <input
                  className="form-input"
                  value={layerName}
                  onChange={e => setLayerName(e.target.value)}
                  placeholder="Layer display name"
                />
              </div>

              <div className="form-field">
                <label className="form-label">Layer type *</label>
                <select
                  className="form-input"
                  value={layerType}
                  onChange={e => setLayerType(e.target.value)}
                >
                  {LAYER_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleAddToSite}
                disabled={adding || !selectedSite}
              >
                {adding ? <Loader size={15} className="spin" /> : <Plus size={15} />}
                Add to Site
              </button>
            </div>
          </section>
        </div>
      </div>
      {showAttrTable && (
        <AttributeTable
          layerId={id}
          layerName={ds?.name ?? ""}
          layerMeta={{
            type: meta.label,
            description: ds.description,
          }}
          fetchAttributes={async (layerId) => {
            const data = await apiFetch(`/api/spatial/data-sources/${layerId}/attributes`)
            return data.features ?? []
          }}
          onClose={() => setShowAttrTable(false)}
        />
      )}
    </div>
  )
}
