import { useEffect, useState } from 'react'
import type { Orientation } from '../types'

/** Derive orientation from the viewport's aspect ratio. Override via
 *  `?forceOrientation=portrait|landscape` query param (dev only). */
export function useOrientation(override?: Orientation | null): Orientation {
  const initial = override ?? readForcedOrientation() ?? compute()
  const [orient, setOrient] = useState<Orientation>(initial)

  useEffect(() => {
    if (override) {
      setOrient(override)
      return
    }
    const forced = readForcedOrientation()
    if (forced) {
      setOrient(forced)
      return
    }
    const onResize = () => setOrient(compute())
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [override])

  return orient
}

function compute(): Orientation {
  if (typeof window === 'undefined') return 'landscape'
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
}

export function readForcedOrientation(): Orientation | null {
  if (!import.meta.env.DEV) return null
  if (typeof window === 'undefined') return null
  const forced = new URLSearchParams(window.location.search).get('forceOrientation')
  if (forced === 'portrait' || forced === 'landscape') return forced
  return null
}

export function writeForcedOrientation(o: Orientation | null): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (o) url.searchParams.set('forceOrientation', o)
  else url.searchParams.delete('forceOrientation')
  window.history.replaceState(null, '', url.toString())
}
