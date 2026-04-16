import { useEffect, useState } from 'react'
import { breakpoints } from '@mightyspatial/tokens'
import type { Breakpoint } from '../types'

interface Bounds {
  phone: number
  tablet: number
}

/** Returns the current breakpoint. In dev, `?forceBreakpoint=phone|tablet|desktop`
 *  overrides the viewport. */
export function useBreakpoint(overrides?: Partial<Bounds>): Breakpoint {
  const bounds: Bounds = {
    phone: overrides?.phone ?? breakpoints.tablet, // <tablet = phone
    tablet: overrides?.tablet ?? breakpoints.desktop, // <desktop = tablet
  }

  const forced = readForcedBreakpoint()
  const [bp, setBp] = useState<Breakpoint>(() => forced ?? compute(window.innerWidth, bounds))

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

function readForcedBreakpoint(): Breakpoint | null {
  if (!import.meta.env.DEV) return null
  if (typeof window === 'undefined') return null
  const forced = new URLSearchParams(window.location.search).get('forceBreakpoint')
  if (forced === 'phone' || forced === 'tablet' || forced === 'desktop') return forced
  return null
}
