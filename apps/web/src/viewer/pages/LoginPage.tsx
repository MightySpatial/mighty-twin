/** Login page (T+390 polish).
 *
 *  Visual style: cobalt → magenta gradient logo block to match the
 *  rest of the post-T+90 app, dark card with thin border, focus rings
 *  on inputs, primary button in #2453ff. OAuth buttons stay behind
 *  VITE_OAUTH_ENABLED so we don't surface 404s for endpoints that
 *  haven't been built yet.
 *
 *  Functional changes:
 *    - Email validation feedback inline
 *    - Caps-lock detector on the password field (small chip on the
 *      right of the input)
 *    - Disabled "Sign in" until both fields are non-empty
 *    - Remember-me toggle that persists email locally
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import SplashOverlay from '../components/SplashOverlay/SplashOverlay'
import type { PublicSettings } from '../types/api'
import './LoginPage.css'

const API_URL = import.meta.env.VITE_API_URL || ''
const REMEMBER_KEY = 'mighty:login:email'

interface ProvidersAvailability {
  google: { enabled: boolean }
  microsoft: { enabled: boolean }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, loginWithGoogle, loginWithMicrosoft, isLoading } = useAuth()
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) ?? '')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem(REMEMBER_KEY)))
  const [capsLock, setCapsLock] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [splashSettings, setSplashSettings] = useState<PublicSettings | null>(null)
  const [splashDismissed, setSplashDismissed] = useState(false)
  const [oauthProviders, setOauthProviders] = useState<ProvidersAvailability | null>(null)
  const [oauthError, setOauthError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/settings/public`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PublicSettings | null) => {
        if (data?.login_splash_enabled) setSplashSettings(data)
      })
      .catch(() => undefined)
    // Probe OAuth providers — server tells us which are configured.
    // Replaces the build-time VITE_OAUTH_ENABLED flag from T+390.
    fetch(`${API_URL}/api/auth/oauth/providers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ProvidersAvailability | null) => {
        if (data) setOauthProviders(data)
      })
      .catch(() => undefined)

    // If we came back from a failed OAuth callback, surface the
    // server's error message above the form.
    const params = new URLSearchParams(window.location.search)
    const errToken = params.get('oauth_error')
    if (errToken) {
      const [provider, b64] = errToken.split(':')
      try {
        const padded = (b64 || '') + '='.repeat((4 - ((b64 || '').length % 4)) % 4)
        const decoded = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
        setOauthError(`${provider}: ${decoded}`)
      } catch {
        setOauthError(`${provider}: sign-in failed`)
      }
      params.delete('oauth_error')
      const cleanedSearch = params.toString()
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (cleanedSearch ? '?' + cleanedSearch : ''),
      )
    }
  }, [])

  const oauthAvailable =
    oauthProviders?.google.enabled || oauthProviders?.microsoft.enabled
  const googleEnabled = !!oauthProviders?.google.enabled
  const microsoftEnabled = !!oauthProviders?.microsoft.enabled

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      if (remember) localStorage.setItem(REMEMBER_KEY, email.trim())
      else localStorage.removeItem(REMEMBER_KEY)
      navigate('/viewer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-loading">Loading…</div>
      </div>
    )
  }

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim())
  const canSubmit = validEmail && password.length > 0 && !submitting

  return (
    <div className="login-page">
      {splashSettings && !splashDismissed && (
        <SplashOverlay
          title={splashSettings.login_splash_title ?? 'Welcome'}
          message={splashSettings.login_splash_message ?? ''}
          bgUrl={splashSettings.login_splash_bg_url}
          onDismiss={() => setSplashDismissed(true)}
        />
      )}
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo-mark">M</div>
          <h1>MightyTwin</h1>
          <p>Sign in to your workspace</p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={submit} className="login-form">
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
                required
                aria-invalid={!!email && !validEmail}
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
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyUp={(e) =>
                  setCapsLock(typeof e.getModifierState === 'function' && e.getModifierState('CapsLock'))
                }
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="login-eye"
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            {capsLock && (
              <div className="login-hint login-hint-warn">
                Caps Lock is on.
              </div>
            )}
          </div>

          <div className="login-row">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Remember email</span>
            </label>
          </div>

          <button
            type="submit"
            className="login-primary"
            disabled={!canSubmit}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
            <ArrowRight size={14} />
          </button>
        </form>

        {oauthError && (
          <div
            className="login-error"
            style={{ marginTop: 14, marginBottom: 0 }}
          >
            <AlertCircle size={16} />
            <span>OAuth sign-in failed — {oauthError}</span>
          </div>
        )}

        {oauthAvailable && (
          <>
            <div className="login-divider">
              <span>or continue with</span>
            </div>
            <div
              className="oauth-buttons"
              style={
                googleEnabled && microsoftEnabled
                  ? undefined
                  : { gridTemplateColumns: '1fr' }
              }
            >
              {googleEnabled && (
                <button
                  type="button"
                  className="btn btn-oauth"
                  onClick={loginWithGoogle}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>
              )}
              {microsoftEnabled && (
                <button
                  type="button"
                  className="btn btn-oauth"
                  onClick={loginWithMicrosoft}
                >
                  <svg viewBox="0 0 24 24" width="18" height="18">
                    <path fill="#F25022" d="M1 1h10v10H1z"/>
                    <path fill="#00A4EF" d="M1 13h10v10H1z"/>
                    <path fill="#7FBA00" d="M13 1h10v10H13z"/>
                    <path fill="#FFB900" d="M13 13h10v10H13z"/>
                  </svg>
                  Microsoft
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
