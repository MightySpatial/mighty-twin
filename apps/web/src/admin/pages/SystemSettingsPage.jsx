import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader, AlertCircle, Check } from 'lucide-react'
import { apiFetch, useApiData } from '../hooks/useApi'
import '../styles/components.css'
import './SettingsPage.css'

export default function SystemSettingsPage() {
  const navigate = useNavigate()
  const { data: settings, loading, error: loadError } = useApiData('/api/settings', null)
  const { data: sites } = useApiData('/api/spatial/sites', [])

  const [overviewMode, setOverviewMode] = useState('pins')
  const [preloadSiteSlug, setPreloadSiteSlug] = useState('')
  const [cameraLon, setCameraLon] = useState(133.0)
  const [cameraLat, setCameraLat] = useState(-28.0)
  const [cameraHeight, setCameraHeight] = useState(4000000.0)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (settings) {
      setOverviewMode(settings.overview_mode || 'pins')
      setPreloadSiteSlug(settings.preload_site_slug || '')
      setCameraLon(settings.overview_camera_lon ?? 133.0)
      setCameraLat(settings.overview_camera_lat ?? -28.0)
      setCameraHeight(settings.overview_camera_height ?? 4000000.0)
    }
  }, [settings])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: {
          overview_mode: overviewMode,
          preload_site_slug: overviewMode === 'preload_site' ? preloadSiteSlug : null,
          overview_camera_lon: cameraLon,
          overview_camera_lat: cameraLat,
          overview_camera_height: cameraHeight,
        },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings-page">
      <header className="page-header">
        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/settings')} style={{ marginBottom: 8 }}>
          <ArrowLeft size={16} /> Back to Settings
        </button>
        <h1 className="page-title">System Settings</h1>
        <p className="page-subtitle">Configure viewer overview behaviour</p>
      </header>

      <div className="settings-content">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Loader size={20} className="spin" />
          </div>
        )}

        {loadError && (
          <div className="inline-error" style={{ margin: '0 0 16px' }}>
            <AlertCircle size={15} />
            <span>{loadError}</span>
          </div>
        )}

        {!loading && settings && (
          <section className="section">
            <div className="form-stack">
              {/* Overview Mode */}
              <div className="form-field">
                <label className="form-label">Overview Mode</label>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                  Choose what users see when they open the viewer.
                </p>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 6 }}>
                  <input
                    type="radio"
                    name="overview_mode"
                    value="pins"
                    checked={overviewMode === 'pins'}
                    onChange={() => setOverviewMode('pins')}
                  />
                  <span>All Sites Map (pins on globe)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="overview_mode"
                    value="preload_site"
                    checked={overviewMode === 'preload_site'}
                    onChange={() => setOverviewMode('preload_site')}
                  />
                  <span>Preload a specific site</span>
                </label>
              </div>

              {/* Preload Site Selector */}
              {overviewMode === 'preload_site' && (
                <div className="form-field">
                  <label className="form-label">Site to Preload</label>
                  <select
                    className="form-input"
                    value={preloadSiteSlug}
                    onChange={e => setPreloadSiteSlug(e.target.value)}
                  >
                    <option value="">— Select a site —</option>
                    {(sites || []).map(s => (
                      <option key={s.slug} value={s.slug}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Camera position — shown when mode=pins */}
              {overviewMode === 'pins' && (
                <>
                  <div className="form-field">
                    <label className="form-label">Overview Camera Position</label>
                    <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                      Default camera longitude, latitude, and height for the all-sites globe view.
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Longitude</label>
                        <input
                          className="form-input"
                          type="number"
                          step="0.01"
                          value={cameraLon}
                          onChange={e => setCameraLon(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Latitude</label>
                        <input
                          className="form-input"
                          type="number"
                          step="0.01"
                          value={cameraLat}
                          onChange={e => setCameraLat(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Height (m)</label>
                        <input
                          className="form-input"
                          type="number"
                          step="1000"
                          value={cameraHeight}
                          onChange={e => setCameraHeight(parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {error && (
                <div className="inline-error">
                  <AlertCircle size={15} />
                  <span>{error}</span>
                </div>
              )}

              <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ alignSelf: 'flex-start' }}>
                {saving ? <Loader size={16} className="spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
                {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
