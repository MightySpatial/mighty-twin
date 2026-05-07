import type { ViewMode } from './types'

/** Map a URL pathname to a ViewMode. Unrecognised → viewer-only. */
export function pathnameToMode(pathname: string): ViewMode {
  if (pathname === '/' || pathname === '/viewer' || pathname.startsWith('/viewer/')) {
    return 'viewer-only'
  }
  if (pathname.startsWith('/admin')) return 'admin-only'
  if (pathname.startsWith('/settings')) return 'settings'
  // Legacy split routes resolve to admin (Atlas).
  if (pathname.startsWith('/split')) return 'admin-only'
  return 'viewer-only'
}

/** Canonical pathname for a ViewMode. */
export function modeToPathname(mode: ViewMode): string {
  switch (mode) {
    case 'viewer-only':
      return '/viewer'
    case 'admin-only':
      return '/admin'
    case 'settings':
      return '/settings'
  }
}

/** Whether a transition between two modes should use `history.push` (true) or
 *  `history.replace` (false). Push is for semantic navigation (entering or
 *  leaving Settings); replace is for pure layout toggles so the back button
 *  stays useful. */
export function shouldPush(from: ViewMode, to: ViewMode): boolean {
  if (from === to) return false
  if (from === 'settings' || to === 'settings') return true
  return false
}
