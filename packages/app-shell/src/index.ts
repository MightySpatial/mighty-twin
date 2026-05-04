/**
 * @mightyspatial/app-shell — responsive chrome for Mighty platform apps.
 *
 * See README.md for usage.
 */

export { AppShell } from './components/AppShell'
export { useShellContext } from './context/ShellContext'
export { useBreakpoint } from './hooks/useBreakpoint'
export { useViewMode } from './hooks/useViewMode'
export { useResizeObserver } from './hooks/useResizeObserver'
export { pathnameToMode, modeToPathname, shouldPush } from './routes'

export type {
  AppShellProps,
  BrandProps,
  ViewMode,
  Breakpoint,
  DisplayMode,
  PaneRole,
  ShellContextValue,
} from './types'
