import { useEffect, useState, useCallback } from 'react'
import { authFetch } from '../utils/authFetch'
import { useToast } from './useToast'
import type { SiteData } from '../types/api'

export type { SiteData }

const API_URL = import.meta.env.VITE_API_URL || ''

export function useSite(slug: string | undefined) {
  const [site, setSite] = useState<SiteData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { addToast } = useToast()

  const load = useCallback(async () => {
    if (!slug) { setSite(null); return }
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`${API_URL}/api/spatial/sites/${slug}`)
      if (!res.ok) throw new Error(res.status === 404 ? 'Site not found' : 'Failed to load site')
      setSite(await res.json())
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error loading site'
      setError(msg)
      setSite(null)
      addToast('error', msg)
    } finally {
      setLoading(false)
    }
  }, [slug, addToast])

  useEffect(() => { load() }, [load])

  return { site, loading, error, reload: load }
}
