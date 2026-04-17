/**
 * MightyTwin — Login Page
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Mail, Lock, AlertCircle } from 'lucide-react'
import SplashOverlay from '../components/SplashOverlay/SplashOverlay'
import type { PublicSettings } from '../types/api'
import './LoginPage.css'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function LoginPage() {
  const navigate = useNavigate()
  const { login, loginWithGoogle, loginWithMicrosoft, isLoading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [splashSettings, setSplashSettings] = useState<PublicSettings | null>(null)
  const [splashDismissed, setSplashDismissed] = useState(false)

  // Fetch public settings for login splash
  useEffect(() => {
    fetch(`${API_URL}/api/settings/public`)
      .then(r => r.ok ? r.json() : null)
      .then((data: PublicSettings | null) => {
        if (data?.login_splash_enabled) setSplashSettings(data)
      })
      .catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await login(email, password)
      navigate('/viewer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="login-page">
        <div className="login-loading">Loading...</div>
      </div>
    )
  }

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
          <div className="login-logo">⬡</div>
          <h1>MightyTwin</h1>
          <p>Sign in to your account</p>
        </div>

        {error && (
          <div className="login-error">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <Mail size={18} />
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <Lock size={18} />
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="login-divider">
          <span>or continue with</span>
        </div>

        <div className="oauth-buttons">
          <button
            type="button"
            className="btn btn-oauth"
            onClick={loginWithGoogle}
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google
          </button>

          <button
            type="button"
            className="btn btn-oauth"
            onClick={loginWithMicrosoft}
          >
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path fill="#F25022" d="M1 1h10v10H1z"/>
              <path fill="#00A4EF" d="M1 13h10v10H1z"/>
              <path fill="#7FBA00" d="M13 1h10v10H13z"/>
              <path fill="#FFB900" d="M13 13h10v10H13z"/>
            </svg>
            Microsoft
          </button>
        </div>
      </div>
    </div>
  )
}
