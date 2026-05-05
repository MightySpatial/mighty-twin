/**
 * MightyTwin Admin — Invite / Create User Page
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../hooks/useApi'
import { ChevronLeft, UserPlus, Loader, AlertCircle } from 'lucide-react'
import '../styles/components.css'

const ROLES = [
  { value: 'viewer',  label: 'Viewer',  hint: 'Can view sites and data, no editing.' },
  { value: 'creator', label: 'Creator', hint: 'Can upload data, create sites, and manage layers.' },
  { value: 'admin',   label: 'Admin',   hint: 'Full access including user management.' },
]

export default function UserNewPage() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('viewer')

  const selectedRole = ROLES.find(r => r.value === role)

  const handleCreate = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Name, email, and password are required.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await apiFetch('/api/auth/register', {
        method: 'POST',
        body: { name: name.trim(), email: email.trim(), password },
      })
      // After register, update role if not viewer (default)
      if (role !== 'viewer') {
        // Get the new user to find their ID
        const users = await apiFetch('/api/auth/users')
        const newUser = users.find(u => u.email === email.trim())
        if (newUser) {
          await apiFetch(`/api/auth/users/${newUser.id}`, {
            method: 'PATCH',
            body: { role },
          })
        }
      }
      navigate('/admin/users')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="site-detail-page">
      <header className="page-header page-header-with-action">
        <div>
          <button className="btn btn-ghost back-btn" onClick={() => navigate('/admin/users')}>
            <ChevronLeft size={18} /> Users
          </button>
          <h1 className="page-title">Invite User</h1>
        </div>
        <button className="btn btn-primary" onClick={handleCreate} disabled={saving}>
          {saving ? <Loader size={16} className="spin" /> : <UserPlus size={16} />}
          Create User
        </button>
      </header>

      {error && (
        <div className="inline-error" style={{ margin: '0 24px 16px' }}>
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      <div style={{ padding: '0 24px', maxWidth: 480 }}>
        <section className="section">
          <div className="form-stack">
            <div className="form-field">
              <label className="form-label">Full Name *</label>
              <input
                className="form-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Jane Smith"
                autoFocus
              />
            </div>
            <div className="form-field">
              <label className="form-label">Email *</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@example.com"
              />
            </div>
            <div className="form-field">
              <label className="form-label">Password *</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min 8 characters"
              />
            </div>
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">Role</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ROLES.map(r => (
              <label
                key={r.value}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: `1px solid ${role === r.value ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  background: role === r.value ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                  style={{ marginTop: 2, accentColor: '#6366f1' }}
                />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: role === r.value ? '#a5b4fc' : 'rgba(255,255,255,0.9)' }}>
                    {r.label}
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                    {r.hint}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
