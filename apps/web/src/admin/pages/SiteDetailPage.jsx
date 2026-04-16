/**
 * MightyTwin Admin — Site Detail / Edit Page
 * View and edit a site: metadata, camera, branding, layer list.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useApiData, apiFetch } from '../hooks/useApi'
import {
  ChevronLeft, Save, Loader, AlertCircle, Trash2,
  Eye, EyeOff, GripVertical, Plus, ExternalLink, BookOpen, Globe, GlobeLock
} from 'lucide-react'
import '../styles/components.css'
import './SiteDetailPage.css'

// ─── Layer row ────────────────────────────────────────────────────────────────

function LayerRow({ layer, siteSlug, onToggle, onDelete }) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e) => {
    e.stopPropagation()
    if (!window.confirm(`Remove layer "${layer.name}" from this site?`)) return
    setDeleting(true)
    try {
      await apiFetch(`/api/spatial/sites/${siteSlug}/layers/${layer.id}`, { method: 'DELETE' })
      onDelete(layer.id)
    } catch (err) {
      alert(`Failed: ${err.message}`)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`layer-row ${layer.visible ? '' : 'layer-row-hidden'}`}>
      <div className="layer-row-grip">
        <GripVertical size={14} />
      </div>
      <div className="layer-row-info">
        <span className="layer-row-name">{layer.name}</span>
        <span className="layer-type-badge">{layer.type}</span>
        {layer.opacity < 1 && (
          <span className="layer-opacity-badge">{Math.round(layer.opacity * 100)}%</span>
        )}
      </div>
      <div className="layer-row-actions">
        <button
          className="btn btn-ghost btn-icon"
          title={layer.visible ? 'Visible' : 'Hidden'}
          onClick={() => onToggle(layer)}
        >
          {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <button
          className="btn btn-ghost btn-icon"
          title="Remove layer"
          disabled={deleting}
          onClick={handleDelete}
        >
          {deleting ? <Loader size={14} className="spin" /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SiteDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { isDesktop } = useBreakpoint()

  const { data: site, loading, error, reload } = useApiData(
    slug ? `/api/spatial/sites/${slug}` : null, null
  )

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [layers, setLayers] = useState([])
  const [storyMaps, setStoryMaps] = useState([])
  const [storyMapsLoading, setStoryMapsLoading] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [primaryColor, setPrimaryColor] = useState('#6366f1')
  const [logoUrl, setLogoUrl] = useState('')
  const [camera, setCamera] = useState({ longitude: 0, latitude: 0, height: 1000 })
  const [markerColor, setMarkerColor] = useState('#6366f1')
  const [markerSymbol, setMarkerSymbol] = useState('pin')

  // Sync form from loaded data
  useEffect(() => {
    if (!site) return
    setName(site.name || '')
    setDescription(site.description || '')
    setIsPublic(site.is_public || false)
    setPrimaryColor(site.primary_color || '#6366f1')
    setLogoUrl(site.logo_url || '')
    setMarkerColor(site.marker_color || '#6366f1')
    setMarkerSymbol(site.marker_symbol || 'pin')
    setLayers(site.layers || [])
    if (site.default_camera) {
      setCamera({
        longitude: site.default_camera.longitude ?? 0,
        latitude: site.default_camera.latitude ?? 0,
        height: site.default_camera.height ?? 1000,
      })
    }
    // Load story maps
    setStoryMapsLoading(true)
    apiFetch(`/api/story-maps?site_slug=${site.slug}`)
      .then(data => setStoryMaps(Array.isArray(data) ? data : []))
      .catch(() => setStoryMaps([]))
      .finally(() => setStoryMapsLoading(false))
  }, [site])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await apiFetch(`/api/spatial/sites/${slug}`, {
        method: 'PATCH',
        body: {
          name,
          description: description || null,
          is_public: isPublic,
          primary_color: primaryColor,
          logo_url: logoUrl || null,
          marker_color: markerColor || null,
          marker_symbol: markerSymbol || null,
          default_camera: {
            longitude: parseFloat(camera.longitude) || 0,
            latitude: parseFloat(camera.latitude) || 0,
            height: parseFloat(camera.height) || 1000,
          },
        },
      })
      reload()
    } catch (err) {
      setSaveError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleLayerToggle = async (layer) => {
    const newVisible = !layer.visible
    setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: newVisible } : l))
    try {
      await apiFetch(`/api/spatial/sites/${slug}/layers/${layer.id}`, {
        method: 'PATCH',
        body: { visible: newVisible },
      })
    } catch (err) {
      // Revert
      setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: layer.visible } : l))
    }
  }

  const handleLayerDelete = (layerId) => {
    setLayers(prev => prev.filter(l => l.id !== layerId))
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete site "${name}"? This removes all its layers.`)) return
    try {
      await apiFetch(`/api/spatial/sites/${slug}`, { method: 'DELETE' })
      navigate('/admin/sites')
    } catch (err) {
      alert(`Failed: ${err.message}`)
    }
  }

  if (loading) {
    return (
      <div className="site-detail-loading">
        <Loader size={24} className="spin" />
      </div>
    )
  }

  if (error || !site) {
    return (
      <div className="site-detail-error">
        <AlertCircle size={20} />
        <span>{error || 'Site not found'}</span>
        <button className="btn btn-ghost" onClick={() => navigate('/admin/sites')}>
          <ChevronLeft size={16} /> Back
        </button>
      </div>
    )
  }

  return (
    <div className="site-detail-page">
      {/* Header */}
      {isDesktop && (
        <header className="page-header page-header-with-action">
          <div>
            <button className="btn btn-ghost back-btn" onClick={() => navigate('/admin/sites')}>
              <ChevronLeft size={18} /> Sites
            </button>
            <h1 className="page-title">{site.name}</h1>
            <p className="page-subtitle">
              <code className="site-slug">{site.slug}</code>
              <span className={`status-badge ${site.is_public ? 'status-active' : 'status-inactive'}`}>
                {site.is_public ? 'Public' : 'Private'}
              </span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a
              href={`http://192.168.64.3:3000/site/${slug}`}
              target="_blank"
              rel="noreferrer"
              className="btn btn-secondary"
              title="Open in Viewer"
            >
              <ExternalLink size={16} /> Open in Viewer
            </a>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
              Save
            </button>
            <button className="btn btn-ghost btn-icon" title="Delete site" onClick={handleDelete}>
              <Trash2 size={16} />
            </button>
          </div>
        </header>
      )}

      {saveError && (
        <div className="inline-error" style={{ margin: '0 24px 16px' }}>
          <AlertCircle size={15} />
          <span>{saveError}</span>
        </div>
      )}

      <div className="site-detail-grid">
        {/* Left col: metadata + camera */}
        <div className="site-detail-left">

          {/* Basic info */}
          <section className="section">
            <h2 className="section-title">Basic Info</h2>
            <div className="form-stack">
              <div className="form-field">
                <label className="form-label">Name</label>
                <input
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Site name"
                />
              </div>
              <div className="form-field">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input form-textarea"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Optional description"
                  rows={2}
                />
              </div>
              <div className="form-field form-inline">
                <label className="form-label">Public access</label>
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={e => setIsPublic(e.target.checked)}
                  style={{ accentColor: 'var(--color-accent)' }}
                />
              </div>
            </div>
          </section>

          {/* Branding */}
          <section className="section">
            <h2 className="section-title">Branding</h2>
            <div className="form-stack">
              <div className="form-field">
                <label className="form-label">Logo URL</label>
                <input
                  className="form-input"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                />
                {logoUrl && (
                  <img src={logoUrl} alt="Logo preview" className="logo-preview" />
                )}
              </div>
              <div className="form-field form-inline">
                <label className="form-label">Primary colour</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer' }}
                  />
                  <input
                    className="form-input"
                    value={primaryColor}
                    onChange={e => setPrimaryColor(e.target.value)}
                    style={{ maxWidth: 100, fontFamily: 'monospace' }}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Marker */}
          <section className="section">
            <h2 className="section-title">Marker</h2>
            <div className="form-stack">
              <div className="form-field form-inline">
                <label className="form-label">Marker colour</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={markerColor}
                    onChange={e => setMarkerColor(e.target.value)}
                    style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer' }}
                  />
                  <input
                    className="form-input"
                    value={markerColor}
                    onChange={e => setMarkerColor(e.target.value)}
                    style={{ maxWidth: 100, fontFamily: 'monospace' }}
                  />
                </div>
              </div>
              <div className="form-field form-inline">
                <label className="form-label">Marker symbol</label>
                <select
                  className="form-select"
                  value={markerSymbol}
                  onChange={e => setMarkerSymbol(e.target.value)}
                  style={{ maxWidth: 150 }}
                >
                  <option value="pin">Pin</option>
                  <option value="circle">Circle</option>
                  <option value="square">Square</option>
                  <option value="star">Star</option>
                  <option value="diamond">Diamond</option>
                </select>
              </div>
            </div>
          </section>

          {/* Default camera */}
          <section className="section">
            <h2 className="section-title">Default Camera</h2>
            <div className="camera-grid">
              <div className="form-field">
                <label className="form-label">Longitude</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.0001"
                  value={camera.longitude}
                  onChange={e => setCamera(c => ({ ...c, longitude: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Latitude</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.0001"
                  value={camera.latitude}
                  onChange={e => setCamera(c => ({ ...c, latitude: e.target.value }))}
                />
              </div>
              <div className="form-field">
                <label className="form-label">Height (m)</label>
                <input
                  className="form-input"
                  type="number"
                  step="100"
                  value={camera.height}
                  onChange={e => setCamera(c => ({ ...c, height: e.target.value }))}
                />
              </div>
            </div>
          </section>

        </div>

        {/* Right col: layers */}
        <div className="site-detail-right">
          <section className="section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 className="section-title" style={{ margin: 0 }}>
                Layers ({layers.length})
              </h2>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/admin/sites/${slug}/add-layer`)}
              >
                <Plus size={14} /> Add Layer
              </button>
            </div>
            {layers.length === 0 ? (
              <p className="empty-state-hint">No layers yet. Add one to get started.</p>
            ) : (
              <div className="layers-list">
                {layers
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map(layer => (
                    <LayerRow
                      key={layer.id}
                      layer={layer}
                      siteSlug={slug}
                      onToggle={handleLayerToggle}
                      onDelete={handleLayerDelete}
                    />
                  ))}
              </div>
            )}
          </section>
          {/* Story Maps section */}
          <section className="section" style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 className="section-title" style={{ margin: 0 }}>
                <BookOpen size={16} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                Story Maps ({storyMaps.length})
              </h2>
            </div>
            {storyMapsLoading ? (
              <Loader size={16} className="spin" />
            ) : storyMaps.length === 0 ? (
              <p className="empty-state-hint">No story maps yet.</p>
            ) : (
              <div className="layers-list">
                {storyMaps.map(sm => (
                  <div key={sm.id} className="layer-row" style={{ alignItems: 'center' }}>
                    <div className="layer-row-info">
                      <span className="layer-row-name">{sm.name}</span>
                      <span className="layer-type-badge">{sm.slides?.length ?? 0} slides</span>
                      <span className={`status-badge ${sm.is_published ? 'status-active' : 'status-inactive'}`}>
                        {sm.is_published ? 'Published' : 'Draft'}
                      </span>
                    </div>
                    <div className="layer-row-actions">
                      <button
                        className="btn btn-ghost btn-icon"
                        title={sm.is_published ? 'Unpublish' : 'Publish'}
                        onClick={async () => {
                          try {
                            await apiFetch(`/api/story-maps/${sm.id}`, {
                              method: 'PATCH',
                              body: { is_published: !sm.is_published },
                            })
                            setStoryMaps(prev => prev.map(s =>
                              s.id === sm.id ? { ...s, is_published: !s.is_published } : s
                            ))
                          } catch (err) {
                            alert(`Failed: ${err.message}`)
                          }
                        }}
                      >
                        {sm.is_published ? <GlobeLock size={15} /> : <Globe size={15} />}
                      </button>
                      <a
                        href={`http://192.168.64.3:3000/sites/${slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost btn-icon"
                        title="View in viewer"
                      >
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Mobile save bar */}
      {!isDesktop && (
        <div className="mobile-action-bar">
          <button className="btn btn-primary btn-full" onClick={handleSave} disabled={saving}>
            {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
            Save Changes
          </button>
        </div>
      )}
    </div>
  )
}
