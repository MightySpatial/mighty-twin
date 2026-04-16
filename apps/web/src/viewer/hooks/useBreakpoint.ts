import { useShellContext } from '@mightyspatial/app-shell'

// Breakpoints retained for any code still reading the numeric values directly.
export const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  desktop: 1024,
}

/** Pane-aware breakpoint for the viewer app. See admin/hooks/useBreakpoint.js
 *  for the rationale — same pattern, same return shape. */
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
