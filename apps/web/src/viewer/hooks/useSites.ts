import { useEffect, useState } from 'react'
import { authFetch } from '../utils/authFetch'
import { useToast } from './useToast'
import type { SiteListItem } from '../types/api'

export type { SiteListItem }

const API_URL = import.meta.env.VITE_API_URL || ''

export function useSites() {
  const [sites, setSites] = useState<SiteListItem[]>([])
  const [loading, setLoading] = useState(true)
  const { addToast } = useToast()

  useEffect(() => {
    authFetch(`${API_URL}/api/spatial/sites`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to load sites')
        return r.json()
      })
      .then(setSites)
      .catch((err) => {
        setSites([])
        addToast('error', err instanceof Error ? err.message : 'Failed to load sites')
      })
      .finally(() => setLoading(false))
  }, [addToast])

  return { sites, loading }
}
