/** First-run setup page — T+1480.
 *
 *  Shown when /api/setup/status reports {is_complete: false} (no
 *  admin user has signed up yet). Creates the first admin via
 *  /api/setup/admin and immediately signs them in via /api/auth/login,
 *  same code path the regular login uses, so they land in the
 *  authenticated shell with valid tokens.
 *
 *  Standalone page — no app shell, no chrome — so a fresh install
 *  doesn't try to render an admin-shaped UI before the admin exists.
 */

import { useEffect, useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle, Loader, Lock, Mail, Shield, User } from 'lucide-react'
import './LoginPage.css' // reuse the cobalt login styling

const API_URL = import.meta.env.VITE_API_URL || ''

interface Props {
  onDone: () => void
}

export default function SetupPage({ onDone }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [step, setStep] = useState<'form' | 'done'>('form')

  useEffect(() => {
    document.title = 'MightyTwin · Set up your workspace'
  }, [])

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim())
  const validPassword = password.length >= 8
  const passwordsMatch = password === confirm
  const canSubmit =
    name.trim().length > 0 &&
    validEmail &&
    validPassword &&
    passwordsMatch &&
    !busy

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setErr(null)
    try {
      const adminRes = await fetch(`${API_URL}/api/setup/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
        }),
      })
      if (!adminRes.ok) {
        let msg = `Setup failed (${adminRes.status})`
        try {
          msg = (await adminRes.json())?.detail || msg
        } catch {
          /* keep default */
        }
        throw new Error(msg)
      }

      // Auto sign-in via the regular login endpoint so the user lands
      // in the authenticated shell without a second password prompt.
      const loginRes = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
        }),
      })
      if (!loginRes.ok) {
        throw new Error('Account created but auto-login failed — refresh and sign in.')
      }
      const tokens = (await loginRes.json()) as {
        access_token: string
        refresh_token: string
      }
      localStorage.setItem('accessToken', tokens.access_token)
      localStorage.setItem('refreshToken', tokens.refresh_token)

      // Mark setup complete (best-effort; server tolerates re-call).
      await fetch(`${API_URL}/api/setup/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }).catch(() => undefined)

      setStep('done')
      // Brief celebration then unmount → App.tsx re-checks auth and renders the shell.
      setTimeout(() => onDone(), 1100)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="login-page">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 18px',
              borderRadius: 16,
              background: 'linear-gradient(135deg, #2dd4bf, #34d399)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0f0f14',
              boxShadow: '0 8px 20px rgba(45,212,191,0.32)',
            }}
          >
            <CheckCircle size={28} />
          </div>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 600 }}>
            Workspace ready
          </h1>
          <p style={{ margin: 0, color: 'rgba(240,242,248,0.55)', fontSize: 13 }}>
            Signing you in…
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-page">
      <div className="login-card" style={{ maxWidth: 460 }}>
        <div className="login-header">
          <div className="login-logo-mark">M</div>
          <h1>Set up MightyTwin</h1>
          <p>Create the first admin account for this workspace.</p>
        </div>

        {err && (
          <div className="login-error">
            <AlertCircle size={16} />
            <span>{err}</span>
          </div>
        )}

        <form onSubmit={submit} className="login-form">
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <div className="input-wrapper">
              <User size={16} />
              <input
                id="name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <Mail size={16} />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-invalid={!!email && !validEmail}
                required
              />
            </div>
            {email && !validEmail && (
              <div className="login-hint">Enter a valid email address.</div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <Lock size={16} />
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                aria-invalid={!!password && !validPassword}
                required
              />
            </div>
            {password && !validPassword && (
              <div className="login-hint login-hint-warn">
                Password must be at least 8 characters.
              </div>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="confirm">Confirm password</label>
            <div className="input-wrapper">
              <Lock size={16} />
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                aria-invalid={!!confirm && !passwordsMatch}
                required
              />
            </div>
            {confirm && !passwordsMatch && (
              <div className="login-hint login-hint-warn">
                Passwords don't match.
              </div>
            )}
          </div>

          <div
            style={{
              padding: '8px 10px',
              background: 'rgba(36,83,255,0.06)',
              border: '1px solid rgba(36,83,255,0.32)',
              borderRadius: 7,
              color: 'rgba(240,242,248,0.7)',
              fontSize: 11,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
              marginBottom: 14,
            }}
          >
            <Shield size={11} style={{ marginTop: 2, color: '#9bb3ff' }} />
            <span>
              This account becomes the workspace admin. You'll be able to invite
              additional users (Admin / Creator / Viewer roles) once signed in.
            </span>
          </div>

          <button
            type="submit"
            className="login-primary"
            disabled={!canSubmit}
          >
            {busy ? <Loader size={14} className="spin" /> : null}
            {busy ? 'Creating account…' : 'Create admin & sign in'}
            {!busy && <ArrowRight size={14} />}
          </button>
        </form>
      </div>
    </div>
  )
}
