import { useEffect, useState } from 'react'
import { breakpoints } from '@mightyspatial/tokens'
import type { Breakpoint } from '../types'

interface Bounds {
  phone: number
  tablet: number
}

/** Returns the current breakpoint. Override order (highest priority first):
 *   1. The `override` arg (used by the shell's Breakpoint toggle)
 *   2. `?forceBreakpoint=phone|tablet|desktop` URL param (dev only)
 *   3. The actual viewport width
 */
export function useBreakpoint(
  overrides?: Partial<Bounds> & { override?: Breakpoint | null },
): Breakpoint {
  const bounds: Bounds = {
    phone: overrides?.phone ?? breakpoints.tablet,
    tablet: overrides?.tablet ?? breakpoints.desktop,
  }

  const forced = overrides?.override ?? readForcedBreakpoint()
  const [bp, setBp] = useState<Breakpoint>(() =>
    forced ?? compute(window.innerWidth, bounds),
  )

  useEffect(() => {
    if (forced) {
      setBp(forced)
      return
    }
    const onResize = () => setBp(compute(window.innerWidth, bounds))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [bounds.phone, bounds.tablet, forced])

  return bp
}

function compute(width: number, bounds: Bounds): Breakpoint {
  if (width < bounds.phone) return 'phone'
  if (width < bounds.tablet) return 'tablet'
  return 'desktop'
}

export function readForcedBreakpoint(): Breakpoint | null {
  if (!import.meta.env.DEV) return null
  if (typeof window === 'undefined') return null
  const forced = new URLSearchParams(window.location.search).get('forceBreakpoint')
  if (forced === 'phone' || forced === 'tablet' || forced === 'desktop') return forced
  return null
}

/** Update `?forceBreakpoint=` in the URL without reloading. Dev only. */
export function writeForcedBreakpoint(bp: Breakpoint | null): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (bp) url.searchParams.set('forceBreakpoint', bp)
  else url.searchParams.delete('forceBreakpoint')
  window.history.replaceState(null, '', url.toString())
}
