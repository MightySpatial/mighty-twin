import { useShellContext } from '@mightyspatial/app-shell'

// Breakpoints retained for any code still reading the numeric values directly.
export const BREAKPOINTS = {
  phone: 0, // 0-767px
  tablet: 768, // 768-1023px
  desktop: 1024, // 1024+
}

/** Pane-aware breakpoint for the admin app.
 *
 *  v1 read window.innerWidth, which is wrong here: the admin pane can
 *  be much narrower than the window (for example when `split-viewer`
 *  pins admin to a 320px overlay drawer on tablet). The shell's
 *  ShellContext exposes the current pane's breakpoint via a
 *  ResizeObserver; delegating to it keeps every call site working
 *  unchanged (same return shape: breakpoint + width + booleans).
 *
 *  `width` mirrors the pane's width, not the window's — more useful
 *  for CSS-media-query-like consumer code (e.g. the inline table-vs-
 *  cards toggle in UsersPage). */
export function useBreakpoint() {
  const { breakpoint, paneSize } = useShellContext()
  return {
    breakpoint,
    width: paneSize.width,
    isPhone: breakpoint === 'phone',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isMobile: breakpoint !== 'desktop',
  }
}
