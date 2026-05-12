import { useShellContext, useOrientation } from '@mightyspatial/app-shell'

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
 *  `layoutMode` is an orientation-aware variant — see §3 of the
 *  implementation brief (mockups/IMPLEMENTATION.md). Tablet portrait
 *  uses the phone pattern (bottom nav, widget sheet); tablet landscape
 *  uses the desktop pattern (sidebar, right pane). Branch on
 *  `layoutMode` instead of `isTablet` to retire the drawer pattern. */
export function useBreakpoint() {
  const { breakpoint, paneSize } = useShellContext()
  const orientation = useOrientation()
  const layoutMode =
    breakpoint === 'phone'
      ? 'phone'
      : breakpoint === 'tablet'
        ? (orientation === 'portrait' ? 'tabletPortrait' : 'tabletLandscape')
        : 'desktop'
  return {
    breakpoint,
    width: paneSize.width,
    isPhone: breakpoint === 'phone',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop',
    isMobile: breakpoint !== 'desktop',
    orientation,
    layoutMode,
  }
}
