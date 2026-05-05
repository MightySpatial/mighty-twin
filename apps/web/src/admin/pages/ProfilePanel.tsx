/** Settings — Profile panel.
 *
 *  Lets the signed-in user change their display name and password
 *  without needing an admin to reset it for them. Read-only fields:
 *  email, role, account creation date.
 */

import { useEffect, useState } from 'react'
import { CheckCircle, Key, Loader, Save, Shield } from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import { useToast } from '../../viewer/hooks/useToast'

type Role = 'admin' | 'creator' | 'viewer'

interface Me {
  id: string
  email: string
  name: string
  role: Role
  is_active: boolean
  created_at: string | null
  /** When true, the account was created via OAuth — there's no local
   *  password to change here, the user must use their IdP. */
  has_password?: boolean
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  creator: 'Creator',
  viewer: 'Viewer',
}

export default function ProfilePanel() {
  const { addToast } = useToast()
  const [me, setMe] = useState<Me | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  useEffect(() => {
    apiFetch('/api/auth/me')
      .then((d) => {
        const m = d as Me
        setMe(m)
        setName(m.name)
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  async function saveName() {
    if (!me || !name.trim() || name.trim() === me.name) return
    setSavingName(true)
    try {
      const updated = (await apiFetch(`/api/auth/users/${me.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      })) as Me
      setMe({ ...me, name: updated.name })
      addToast('success', 'Display name updated.')
    } catch (e) {
      addToast('error', `Couldn't save name: ${(e as Error).message}`)
    } finally {
      setSavingName(false)
    }
  }

  if (error) {
    return (
      <div style={{ padding: 24, color: '#fca5a5' }}>Couldn't load profile: {error}</div>
    )
  }
  if (!me) {
    return (
      <div style={{ padding: 24, color: 'rgba(240,242,248,0.5)' }}>Loading…</div>
    )
  }

  return (
    <div style={{ padding: 24, color: '#f0f2f8', maxWidth: 560 }}>
      <header style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Profile</h2>
        <p style={{ margin: '4px 0 0', color: 'rgba(240,242,248,0.55)', fontSize: 12 }}>
          Your account, password, and role.
        </p>
      </header>

      <Card title="Account">
        <Row label="Email">
          <code
            style={{
              fontFamily: 'monospace',
              fontSize: 13,
              color: 'rgba(240,242,248,0.85)',
            }}
          >
            {me.email}
          </code>
        </Row>
        <Row label="Role">
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '2px 10px',
              background: 'rgba(36,83,255,0.14)',
              border: '1px solid rgba(36,83,255,0.32)',
              borderRadius: 999,
              color: '#9bb3ff',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <Shield size={11} /> {ROLE_LABEL[me.role]}
          </span>
        </Row>
        {me.created_at && (
          <Row label="Joined">
            {new Date(me.created_at).toLocaleDateString()}
          </Row>
        )}
      </Card>

      <Card title="Display name">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={input}
          />
          <button
            onClick={saveName}
            disabled={savingName || !name.trim() || name.trim() === me.name}
            style={{
              ...primaryBtn,
              opacity:
                savingName || !name.trim() || name.trim() === me.name ? 0.5 : 1,
            }}
          >
            {savingName ? <Loader size={12} className="spin" /> : <Save size={12} />}
            Save
          </button>
        </div>
      </Card>

      <Card title="Password">
        {showPwd ? (
          <ChangePasswordForm
            onCancel={() => setShowPwd(false)}
            onDone={() => {
              setShowPwd(false)
              addToast('success', 'Password updated.')
            }}
          />
        ) : (
          <button onClick={() => setShowPwd(true)} style={primaryBtn}>
            <Key size={12} /> Change password
          </button>
        )}
      </Card>
    </div>
  )
}

function ChangePasswordForm({
  onCancel,
  onDone,
}: {
  onCancel: () => void
  onDone: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const valid =
    current.length > 0 && next.length >= 8 && next === confirm && next !== current

  async function submit() {
    if (!valid) return
    setBusy(true)
    setErr(null)
    try {
      await apiFetch('/api/auth/me/change-password', {
        method: 'POST',
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      onDone()
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        type="password"
        value={current}
        autoComplete="current-password"
        onChange={(e) => setCurrent(e.target.value)}
        placeholder="Current password"
        style={input}
      />
      <input
        type="password"
        value={next}
        autoComplete="new-password"
        onChange={(e) => setNext(e.target.value)}
        placeholder="New password (min 8 characters)"
        style={input}
      />
      <input
        type="password"
        value={confirm}
        autoComplete="new-password"
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="Confirm new password"
        style={input}
      />
      {confirm && next !== confirm && (
        <div style={{ fontSize: 11, color: '#fbbf24' }}>Passwords don't match.</div>
      )}
      {err && (
        <div
          style={{
            padding: 8,
            background: 'rgba(251,113,133,0.06)',
            border: '1px solid rgba(251,113,133,0.32)',
            borderRadius: 7,
            color: '#fca5a5',
            fontSize: 11,
          }}
        >
          {err}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button onClick={onCancel} disabled={busy} style={ghostBtn}>
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || !valid}
          style={{ ...primaryBtn, opacity: busy || !valid ? 0.5 : 1 }}
        >
          {busy ? <Loader size={12} className="spin" /> : <CheckCircle size={12} />}
          Update password
        </button>
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        padding: 14,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
        marginBottom: 12,
      }}
    >
      <h3
        style={{
          margin: '0 0 10px',
          fontSize: 13,
          fontWeight: 600,
          color: '#9bb3ff',
        }}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '4px 0',
        fontSize: 13,
      }}
    >
      <span style={{ width: 90, color: 'rgba(240,242,248,0.55)', fontSize: 12 }}>
        {label}
      </span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  )
}

const input: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 7,
  color: '#f0f2f8',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
}

const primaryBtn: React.CSSProperties = {
  padding: '8px 14px',
  background: '#2453ff',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const ghostBtn: React.CSSProperties = {
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.07)',
  borderRadius: 8,
  color: '#f0f2f8',
  fontSize: 12,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}
