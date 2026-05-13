import { useShellContext, useOrientation } from '@mightyspatial/app-shell'

// Breakpoints retained for any code still reading the numeric values directly.
export const BREAKPOINTS = {
  phone: 0,
  tablet: 768,
  desktop: 1024,
}

export type LayoutMode = 'phone' | 'tabletPortrait' | 'tabletLandscape' | 'desktop'

/** Pane-aware breakpoint for the viewer app. See admin/hooks/useBreakpoint.js
 *  for the rationale — same pattern, same return shape.
 *
 *  `layoutMode` (Phase 3 of mockups/IMPLEMENTATION.md) makes tablet
 *  orientation-aware so portrait can use the phone pattern (widget
 *  sheet, bottom nav) and landscape can use the desktop pattern
 *  (right pane, top tabs). Branch on `layoutMode` instead of
 *  `isTablet` to retire the drawer. */
export function useBreakpoint() {
  const { breakpoint, paneSize } = useShellContext()
  const orientation = useOrientation()
  const layoutMode: LayoutMode =
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
