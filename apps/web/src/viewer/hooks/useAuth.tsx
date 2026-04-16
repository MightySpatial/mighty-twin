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

  // Fetch current user
  const fetchUser = useCallback(async () => {
    const { accessToken } = getTokens()
    if (!accessToken) {
      setState({ user: null, isAuthenticated: false, isLoading: false })
      return
    }

    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
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
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const error: AuthErrorResponse = await res.json()
      throw new Error(error.detail || 'Login failed')
    }

    const { access_token, refresh_token }: AuthTokenResponse = await res.json()
    setTokens(access_token, refresh_token)
    await fetchUser()
  }

  // OAuth redirects
  const loginWithGoogle = () => {
    window.location.href = `${API_URL}/api/auth/google`
  }

  const loginWithMicrosoft = () => {
    window.location.href = `${API_URL}/api/auth/microsoft`
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
