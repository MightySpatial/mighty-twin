/**
 * MightyTwin Admin — First-Run Setup Wizard
 * Walks through: check status → create admin → (optional) branding → done
 * Shown automatically when /api/setup/status returns is_complete: false
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL, apiFetch } from '../hooks/useApi'
import { CheckCircle, Loader, AlertCircle, ChevronRight } from 'lucide-react'
import '../styles/components.css'
import './SetupPage.css'

const STEPS = ['admin', 'branding', 'done']

function StepIndicator({ current }) {
  const labels = { admin: 'Admin Account', branding: 'Branding', done: 'Complete' }
  return (
    <div className="setup-steps">
      {STEPS.map((s, i) => {
        const idx = STEPS.indexOf(current)
        const state = i < idx ? 'done' : i === idx ? 'active' : 'pending'
        return (
          <div key={s} className={`setup-step setup-step--${state}`}>
            <div className="setup-step-dot">
              {state === 'done' ? <CheckCircle size={14} /> : i + 1}
            </div>
            <span className="setup-step-label">{labels[s]}</span>
            {i < STEPS.length - 1 && <div className="setup-step-line" />}
          </div>
        )
      })}
    </div>
  )
}

function AdminStep({ onDone }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async () => {
    if (!name || !email || !password) { setError('All fields required.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setSaving(true); setError(null)
    try {
      await apiFetch('/api/setup/admin', { method: 'POST', body: { name, email, password } })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="setup-card">
      <h2 className="setup-card-title">Create Admin Account</h2>
      <p className="setup-card-hint">This is the first administrator for your MightyTwin instance.</p>

      {error && (
        <div className="inline-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} /><span>{error}</span>
        </div>
      )}

      <div className="form-stack">
        <div className="form-field">
          <label className="form-label">Full Name *</label>
          <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus />
        </div>
        <div className="form-field">
          <label className="form-label">Email *</label>
          <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@yourcompany.com" />
        </div>
        <div className="form-field">
          <label className="form-label">Password * <span style={{ opacity: 0.5, fontSize: 11 }}>(min 8 chars)</span></label>
          <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Strong password" />
        </div>
        <div className="form-field">
          <label className="form-label">Confirm Password *</label>
          <input className="form-input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat password" onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
        </div>
      </div>

      <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }} onClick={handleSubmit} disabled={saving}>
        {saving ? <Loader size={16} className="spin" /> : <ChevronRight size={16} />}
        Create Admin Account
      </button>
    </div>
  )
}

function BrandingStep({ onDone, onSkip }) {
  const [orgName, setOrgName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async () => {
    setSaving(true); setError(null)
    try {
      await apiFetch('/api/setup/branding', {
        method: 'POST',
        body: { org_name: orgName || 'MightyTwin', logo_url: logoUrl || null }
      })
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="setup-card">
      <h2 className="setup-card-title">Branding <span style={{ fontSize: 13, opacity: 0.5, fontWeight: 400 }}>(optional)</span></h2>
      <p className="setup-card-hint">Personalise MightyTwin for your organisation. You can change these later in Settings.</p>

      {error && (
        <div className="inline-error" style={{ marginBottom: 16 }}>
          <AlertCircle size={14} /><span>{error}</span>
        </div>
      )}

      <div className="form-stack">
        <div className="form-field">
          <label className="form-label">Organisation Name</label>
          <input className="form-input" value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="Mighty Spatial" />
        </div>
        <div className="form-field">
          <label className="form-label">Logo URL</label>
          <input className="form-input" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." />
          {logoUrl && <img src={logoUrl} alt="Logo preview" style={{ height: 36, marginTop: 8, borderRadius: 4 }} />}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onSkip}>Skip for now</button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader size={16} className="spin" /> : <ChevronRight size={16} />}
          Save & Continue
        </button>
      </div>
    </div>
  )
}

function DoneStep({ onFinish }) {
  return (
    <div className="setup-card setup-card--done">
      <div className="setup-done-icon"><CheckCircle size={48} /></div>
      <h2 className="setup-card-title">MightyTwin is ready</h2>
      <p className="setup-card-hint">Your instance is configured. Start by creating a site and uploading spatial data.</p>
      <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }} onClick={onFinish}>
        Go to Dashboard
      </button>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState('admin')
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    // Check if setup is already complete
    fetch(`${API_URL}/api/setup/status`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.is_complete) navigate('/'); })
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [navigate])

  const finishSetup = async () => {
    try { await apiFetch('/api/setup/complete', { method: 'POST' }) } catch { /* ignore */ }
    setStep('done')
  }

  if (checking) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <Loader size={32} className="spin" style={{ opacity: 0.4 }} />
    </div>
  )

  return (
    <div className="setup-page">
      <div className="setup-header">
        <div className="setup-logo">⬡</div>
        <h1 className="setup-title">MightyTwin Setup</h1>
        <p className="setup-subtitle">Let's get your instance configured.</p>
      </div>

      <StepIndicator current={step} />

      {step === 'admin' && <AdminStep onDone={() => setStep('branding')} />}
      {step === 'branding' && (
        <BrandingStep
          onDone={finishSetup}
          onSkip={finishSetup}
        />
      )}
      {step === 'done' && <DoneStep onFinish={() => navigate('/')} />}
    </div>
  )
}
