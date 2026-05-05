/**
 * MightyDT 2.0 — Auth Hook
 * Handles authentication state and token management
 */
import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react'
import type { User, AuthTokenResponse, AuthErrorResponse } from '../types/api'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => void
  loginWithMicrosoft: () => void
  logout: () => void
  refreshAuth: () => Promise<void>
}

const API_URL = import.meta.env.VITE_API_URL || ''

const AuthContext = createContext<AuthContextType | null>(null)

// Token storage
const getTokens = () => ({
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
})

const setTokens = (accessToken: string, refreshToken: string) => {
  localStorage.setItem('accessToken', accessToken)
  localStorage.setItem('refreshToken', refreshToken)
}

const clearTokens = () => {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  })

  // Fetch current user (with timeout so a down proxy doesn't hang forever)
  const fetchUser = useCallback(async () => {
    const { accessToken } = getTokens()
    if (!accessToken) {
      setState({ user: null, isAuthenticated: false, isLoading: false })
      return
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)

    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      })

      if (res.ok) {
        const user: User = await res.json()
        setState({ user, isAuthenticated: true, isLoading: false })
      } else if (res.status === 401) {
        // Try refresh
        await refreshAuth()
      } else {
        throw new Error('Failed to fetch user')
      }
    } catch {
      clearTokens()
      setState({ user: null, isAuthenticated: false, isLoading: false })
    } finally {
      clearTimeout(timeout)
    }
  }, [])

  // Refresh tokens
  const refreshAuth = async () => {
    const { refreshToken } = getTokens()
    if (!refreshToken) {
      clearTokens()
      setState({ user: null, isAuthenticated: false, isLoading: false })
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })

      if (res.ok) {
        const tokens: AuthTokenResponse = await res.json()
        setTokens(tokens.access_token, tokens.refresh_token)
        await fetchUser()
      } else {
        throw new Error('Refresh failed')
      }
    } catch {
      clearTokens()
      setState({ user: null, isAuthenticated: false, isLoading: false })
    }
  }

  // Login with email/password
  const login = async (email: string, password: string) => {
    let res: Response
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    try {
      res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      })
    } catch (err) {
      clearTimeout(timeout)
      // In dev mode, fall back to a mock session so the app is usable
      // without a running backend. Production builds always require the API.
      if (import.meta.env.DEV) {
        console.warn('[auth] API unreachable — using dev mock session')
        setTokens('dev-mock-token', 'dev-mock-refresh')
        setState({
          user: { id: 'dev', name: 'Dev User', email, role: 'admin' } as User,
          isAuthenticated: true,
          isLoading: false,
        })
        return
      }
      const msg = err instanceof DOMException && err.name === 'AbortError'
        ? 'Login timed out — is the API running?'
        : 'Server unavailable — is the API running?'
      throw new Error(msg)
    } finally {
      clearTimeout(timeout)
    }

    if (!res.ok) {
      let detail = 'Login failed'
      try {
        const body: AuthErrorResponse = await res.json()
        if (body.detail) detail = body.detail
      } catch {
        // non-JSON error response (e.g. proxy HTML error page)
      }
      throw new Error(detail)
    }

    const { access_token, refresh_token }: AuthTokenResponse = await res.json()
    setTokens(access_token, refresh_token)
    await fetchUser()
  }

  // OAuth redirects — pass the user's current path as ``next`` so the
  // callback can return them to where they came from after the
  // identity-provider hop.
  const oauthNext = encodeURIComponent(
    window.location.pathname + window.location.search,
  )
  const loginWithGoogle = () => {
    window.location.href = `${API_URL}/api/auth/google?next=${oauthNext}`
  }
  const loginWithMicrosoft = () => {
    window.location.href = `${API_URL}/api/auth/microsoft?next=${oauthNext}`
  }

  // Logout
  const logout = () => {
    clearTokens()
    setState({ user: null, isAuthenticated: false, isLoading: false })
  }

  // Check for OAuth callback tokens in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')

    if (accessToken && refreshToken) {
      setTokens(accessToken, refreshToken)
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname)
    }

    fetchUser()
  }, [fetchUser])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        loginWithGoogle,
        loginWithMicrosoft,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
