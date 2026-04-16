/**
 * MightyDT 2.0 Admin — useApi hook
 * Thin wrapper around fetch for the spatial + other API endpoints.
 * All calls go to VITE_API_URL (defaults to localhost:5001).
 */
import { useState, useEffect, useCallback } from 'react'

export const API_URL = import.meta.env.VITE_API_URL || ''

/** Low-level authenticated fetch. Throws on non-2xx. */
export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('accessToken')
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
    body: options.body != null && typeof options.body !== 'string'
      ? JSON.stringify(options.body)
      : options.body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let msg = `API error ${res.status}`
    try { msg = JSON.parse(text)?.detail || msg } catch (_) { /* ignore */ }
    throw new Error(msg)
  }
  if (res.status === 204) return null
  return res.json()
}

/**
 * Generic data-fetching hook.
 * @param {string|null} path — API path; pass null to skip fetching
 * @param {unknown} defaultValue — initial value
 */
export function useApiData(path, defaultValue = null) {
  const [data, setData] = useState(defaultValue)
  const [loading, setLoading] = useState(!!path)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!path) return
    setLoading(true)
    setError(null)
    try {
      setData(await apiFetch(path))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => { load() }, [load])

  return { data, loading, error, reload: load, setData }
}
