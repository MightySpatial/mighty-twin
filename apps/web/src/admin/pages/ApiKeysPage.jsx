import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, EyeOff, Save, Loader, AlertCircle, Check } from 'lucide-react'
import { apiFetch, useApiData } from '../hooks/useApi'
import '../styles/components.css'

export default function ApiKeysPage() {
  const navigate = useNavigate()
  const { data: config, loading, error: loadError } = useApiData('/api/system/config', {})

  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  // Populate field once config loads
  useEffect(() => {
    if (config?.cesium_ion_token) {
      setToken(config.cesium_ion_token)
    }
  }, [config])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await apiFetch('/api/system/config/cesium_ion_token', {
        method: 'PUT',
        body: { value: token },
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
        <h1 className="page-title">API Keys</h1>
        <p className="page-subtitle">Manage external service credentials</p>
      </header>

      <div className="settings-content">
        {loading && (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <Loader size={20} className="spin" />
          </div>
        )}

        {loadError && (
          <div className="inline-error" style={{ margin: '0 24px 16px' }}>
            <AlertCircle size={15} />
            <span>{loadError}</span>
          </div>
        )}

        {!loading && (
          <section className="section">
            <div className="form-stack">
              <div className="form-field">
                <label className="form-label">Cesium Ion Token</label>
                <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 8px' }}>
                  Access token for Cesium Ion services (terrain, 3D tiles, imagery).
                  Get one at <a href="https://ion.cesium.com/tokens" target="_blank" rel="noreferrer" style={{ color: 'var(--color-accent)' }}>ion.cesium.com/tokens</a>
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    type={showToken ? 'text' : 'password'}
                    value={token}
                    onChange={e => setToken(e.target.value)}
                    placeholder="eyJhbGciOi..."
                    style={{ flex: 1, fontFamily: 'monospace' }}
                  />
                  <button
                    className="btn btn-ghost btn-icon"
                    onClick={() => setShowToken(!showToken)}
                    title={showToken ? 'Hide' : 'Show'}
                    type="button"
                  >
                    {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

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
