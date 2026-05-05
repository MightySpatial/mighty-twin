/** Workspace widget overrides — fetched once per session.
 *
 *  Reads /api/engine/widget-layout (auth required). Public/pre-login
 *  viewers don't have a token so we skip the fetch and let the caller
 *  fall back to DEFAULT_WIDGETS unmodified.
 */

import { useEffect, useState } from 'react'
import type { WidgetOverrides } from '../components/MapShell'

const API_URL = import.meta.env.VITE_API_URL || ''

export function useWidgetLayout(): WidgetOverrides | null {
  const [overrides, setOverrides] = useState<WidgetOverrides | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (!token) return
    let cancelled = false
    fetch(`${API_URL}/api/engine/widget-layout`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WidgetOverrides | null) => {
        if (!cancelled) setOverrides(d ?? {})
      })
      .catch(() => {
        if (!cancelled) setOverrides({})
      })
    return () => {
      cancelled = true
    }
  }, [])

  return overrides
}
