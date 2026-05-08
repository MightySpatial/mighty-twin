import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ViewMode } from '../types'
import { modeToPathname, pathnameToMode, shouldPush } from '../routes'

/** Reads the current view mode from the URL and returns a setter that handles
 *  push vs replace semantics. */
export function useViewMode(): { mode: ViewMode; setMode: (mode: ViewMode) => void } {
  const location = useLocation()
  const navigate = useNavigate()
  const mode = pathnameToMode(location.pathname)

  const setMode = useCallback(
    (next: ViewMode) => {
      if (next === mode) return
      const replace = !shouldPush(mode, next)
      navigate(modeToPathname(next), { replace })
    },
    [mode, navigate],
  )

  return { mode, setMode }
}
