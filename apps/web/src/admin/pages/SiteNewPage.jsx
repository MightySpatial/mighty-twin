/**
 * MightyTwin Admin — New Site Page
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { ChevronLeft, Save, Loader, AlertCircle } from 'lucide-react'
import '../styles/components.css'
import './SiteDetailPage.css'

function slugify(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

export default function SiteNewPage() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [longitude, setLongitude] = useState('115.8575')
  const [latitude, setLatitude] = useState('-31.9505')
  const [height, setHeight] = useState('5000')

  const handleNameChange = (val) => {
    setName(val)
    if (!slugManual) setSlug(slugify(val))
  }

  const handleSave = async () => {
    if (!name.trim() || !slug.trim()) {
      setError('Name and slug are required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const site = await apiFetch('/api/spatial/sites', {
        method: 'POST',
        body: {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          is_public: isPublic,
          default_camera: {
            longitude: parseFloat(longitude) || 0,
            latitude: parseFloat(latitude) || 0,
            height: parseFloat(height) || 5000,
          },
        },
      })
      navigate(`/admin/sites/${site.slug}`)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="site-detail-page">
      <header className="page-header page-header-with-action">
        <div>
          <button className="btn btn-ghost back-btn" onClick={() => navigate('/admin/sites')}>
            <ChevronLeft size={18} /> Sites
          </button>
          <h1 className="page-title">New Site</h1>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
          Create Site
        </button>
      </header>

      {error && (
        <div className="inline-error" style={{ margin: '0 24px 16px' }}>
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ padding: '0 24px', maxWidth: 520 }}>
        <section className="section">
          <div className="form-stack">
            <div className="form-field">
              <label className="form-label">Site Name *</label>
              <input
                className="form-input"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                placeholder="e.g. St Ives Showground"
                autoFocus
              />
            </div>
            <div className="form-field">
              <label className="form-label">Slug * <span style={{ fontSize: 11, opacity: 0.6 }}>(URL identifier)</span></label>
              <input
                className="form-input"
                value={slug}
                onChange={e => { setSlug(slugify(e.target.value)); setSlugManual(true) }}
                placeholder="st-ives-showground"
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <div className="form-field">
              <label className="form-label">Description</label>
              <textarea
                className="form-input form-textarea"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Optional"
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

        <section className="section">
          <h2 className="section-title">Default Camera</h2>
          <div className="camera-grid">
            <div className="form-field">
              <label className="form-label">Longitude</label>
              <input className="form-input" type="number" step="0.0001" value={longitude} onChange={e => setLongitude(e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Latitude</label>
              <input className="form-input" type="number" step="0.0001" value={latitude} onChange={e => setLatitude(e.target.value)} />
            </div>
            <div className="form-field">
              <label className="form-label">Height (m)</label>
              <input className="form-input" type="number" step="100" value={height} onChange={e => setHeight(e.target.value)} />
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
