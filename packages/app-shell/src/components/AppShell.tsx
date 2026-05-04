import { useEffect, useMemo, useState } from 'react'
import type {
  AppShellProps,
  Breakpoint,
  DisplayMode,
  Orientation,
  PaneRole,
  ShellContextValue,
} from '../types'
import { ShellContextProvider } from '../context/ShellContext'
import {
  useBreakpoint,
  readForcedBreakpoint,
  writeForcedBreakpoint,
} from '../hooks/useBreakpoint'
import {
  useOrientation,
  readForcedOrientation,
  writeForcedOrientation,
} from '../hooks/useOrientation'
import { useViewMode } from '../hooks/useViewMode'
import { useResizeObserver } from '../hooks/useResizeObserver'
import { TopBar } from './TopBar'
import { MobileBottomNav, MobileHeader } from './MobileTabSwitcher'
import styles from './AppShell.module.css'

/**
 * The responsive app shell. Renders top bar + viewer surface + admin/settings
 * panes per current view mode and breakpoint. The viewer surface mounts once
 * and is never unmounted.
 */
export function AppShell({
  brand,
  viewer,
  adminContent,
  settingsContent,
  tabLabels,
  sidePaneWidth = 420,
  drawerWidth = 320,
  defaultMode = 'viewer-only',
  onModeChange,
  showDeveloperTools = false,
  rightRail = null,
  rightRailWidth = 360,
}: AppShellProps) {
  const { mode, setMode } = useViewMode()

  // Dev-only breakpoint override. Initial value from the URL (so a shared
  // link preserves the override); updates persist back to the URL without
  // reload. In production, this state stays null and the breakpoint is
  // fully auto-detected.
  const [forcedBreakpoint, setForcedBreakpointState] = useState<Breakpoint | null>(() =>
    readForcedBreakpoint(),
  )
  const onForcedBreakpointChange = (bp: Breakpoint | null) => {
    setForcedBreakpointState(bp)
    writeForcedBreakpoint(bp)
  }

  const breakpoint = useBreakpoint({ override: forcedBreakpoint })

  // Dev-only orientation override, same shape as breakpoint.
  const [forcedOrientation, setForcedOrientationState] = useState<Orientation | null>(() =>
    readForcedOrientation(),
  )
  const onForcedOrientationChange = (o: Orientation | null) => {
    setForcedOrientationState(o)
    writeForcedOrientation(o)
  }
  const orientation = useOrientation(forcedOrientation)

  const labels = {
    viewer: tabLabels?.viewer ?? 'Map',
    admin: tabLabels?.admin ?? 'Admin',
    settings: tabLabels?.settings ?? 'Settings',
  }

  // Apply defaultMode when landing on unknown routes ('/').
  useEffect(() => {
    if (window.location.pathname === '/') {
      setMode(defaultMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  // Determine layout classes
  const layoutClass = useMemo(
    () => computeLayoutClass(mode, breakpoint, orientation),
    [mode, breakpoint, orientation],
  )

  const showViewer =
    breakpoint !== 'phone'
      ? mode === 'viewer-only' || mode === 'split-viewer' || mode === 'split-admin'
      : mode === 'viewer-only' || mode === 'split-viewer' || mode === 'split-admin'

  const showAdmin =
    breakpoint !== 'phone'
      ? mode === 'admin-only' || mode === 'split-viewer' || mode === 'split-admin'
      : mode === 'admin-only'

  const showSettings = mode === 'settings'

  // Observe the active viewer-surface element so we can report paneSize
  const viewerObs = useResizeObserver<HTMLDivElement>()
  const adminObs = useResizeObserver<HTMLDivElement>()

  // Roles/display-mode are per-pane; consumers inside the viewer subtree see
  // one value, consumers inside the admin pane see another. We track per-pane
  // context by rendering two separate providers below.

  const rootContent = (
    <div
      className={`${styles.root} ${breakpoint === 'phone' ? styles.rootPhone : ''} ${layoutClass}`}
      style={
        {
          '--side-pane-width': `${sidePaneWidth}px`,
          '--drawer-width': `${drawerWidth}px`,
        } as React.CSSProperties
      }
    >
      {breakpoint === 'phone' ? (
        <MobileHeader
          brand={brand}
          forcedBreakpoint={forcedBreakpoint}
          onForcedBreakpointChange={showDeveloperTools ? onForcedBreakpointChange : undefined}
        />
      ) : (
        <TopBar
          brand={brand}
          mode={mode}
          breakpoint={breakpoint}
          onModeChange={setMode}
          labels={labels}
          forcedBreakpoint={forcedBreakpoint}
          onForcedBreakpointChange={showDeveloperTools ? onForcedBreakpointChange : undefined}
          forcedOrientation={forcedOrientation}
          onForcedOrientationChange={showDeveloperTools ? onForcedOrientationChange : undefined}
        />
      )}

      <div className={styles.bodyShell}>
      <div className={styles.body}>
        {/* Viewer surface — always rendered to preserve Cesium instance. */}
        <div
          ref={viewerObs.ref}
          className={`${styles.viewerSurface} ${!showViewer ? styles.viewerSurfaceHidden : ''}`}
        >
          <PaneContextProvider
            mode={mode}
            breakpoint={paneBreakpointFor('viewer', mode, breakpoint)}
            orientation={orientation}
            setMode={setMode}
            paneSize={viewerObs.size}
            paneRole={paneRoleFor('viewer', mode)}
            displayMode={displayModeFor('viewer', mode, breakpoint)}
          >
            {viewer}
          </PaneContextProvider>
        </div>

        {showAdmin && (
          <div ref={adminObs.ref} className={styles.adminPane}>
            <PaneContextProvider
              mode={mode}
              breakpoint={paneBreakpointFor('admin', mode, breakpoint)}
              orientation={orientation}
              setMode={setMode}
              paneSize={adminObs.size}
              paneRole={paneRoleFor('admin', mode)}
              displayMode={displayModeFor('admin', mode, breakpoint)}
            >
              {adminContent}
            </PaneContextProvider>
          </div>
        )}

        {showSettings && (
          <div className={styles.settingsPane}>
            <PaneContextProvider
              mode={mode}
              breakpoint={breakpoint}
              orientation={orientation}
              setMode={setMode}
              paneSize={{ width: 0, height: 0 }}
              paneRole={null}
              displayMode="full"
            >
              {settingsContent}
            </PaneContextProvider>
          </div>
        )}

      </div>
      {rightRail && breakpoint !== 'phone' && (
        <div
          className={styles.rightRail}
          style={{ flex: `0 0 ${rightRailWidth}px` }}
        >
          {rightRail}
        </div>
      )}
      </div>

      {breakpoint === 'phone' && (
        <MobileBottomNav mode={mode} onModeChange={setMode} labels={labels} />
      )}
    </div>
  )

  // When a breakpoint is explicitly forced (via the dev toggle), frame the
  // shell inside a device-sized stage so devs see how the app actually looks
  // at that viewport. Without a forced breakpoint, the shell fills the
  // browser naturally.
  if (forcedBreakpoint === 'phone') {
    return (
      <div className={styles.stage}>
        <div className={`${styles.deviceFrame} ${styles.deviceFramePhone}`}>
          <div className={styles.deviceLabel}>Phone · 390 × 780</div>
          {rootContent}
        </div>
      </div>
    )
  }
  if (forcedBreakpoint === 'tablet') {
    const isPortrait = orientation === 'portrait'
    return (
      <div className={styles.stage}>
        <div
          className={`${styles.deviceFrame} ${
            isPortrait ? styles.deviceFrameTabletPortrait : styles.deviceFrameTablet
          }`}
        >
          <div className={styles.deviceLabel}>
            Tablet · {isPortrait ? '680 × 900' : '900 × 680'}
          </div>
          {rootContent}
        </div>
      </div>
    )
  }
  return <div className={styles.outer}>{rootContent}</div>
}

function PaneContextProvider({
  mode,
  breakpoint,
  orientation,
  setMode,
  paneSize,
  paneRole,
  displayMode,
  children,
}: {
  mode: ShellContextValue['mode']
  breakpoint: ShellContextValue['breakpoint']
  orientation: ShellContextValue['orientation']
  setMode: ShellContextValue['setMode']
  paneSize: ShellContextValue['paneSize']
  paneRole: ShellContextValue['paneRole']
  displayMode: ShellContextValue['displayMode']
  children: React.ReactNode
}) {
  const value: ShellContextValue = {
    mode,
    breakpoint,
    orientation,
    setMode,
    paneSize,
    paneRole,
    displayMode,
  }
  return <ShellContextProvider value={value}>{children}</ShellContextProvider>
}

function computeLayoutClass(mode: string, bp: string, orient: Orientation): string {
  if (bp === 'phone') {
    if (mode === 'admin-only') return styles.phoneAdmin ?? ''
    if (mode === 'settings') return styles.phoneSettings ?? ''
    return styles.phoneViewer ?? ''
  }
  if (mode === 'split-viewer') {
    if (bp === 'desktop') return styles.splitViewerDesktop ?? ''
    return orient === 'portrait'
      ? (styles.splitViewerTabletPortrait ?? '')
      : (styles.splitViewerTablet ?? '')
  }
  if (mode === 'split-admin') {
    if (bp === 'desktop') return styles.splitAdminDesktop ?? ''
    return orient === 'portrait'
      ? (styles.splitAdminTabletPortrait ?? '')
      : (styles.splitAdminTablet ?? '')
  }
  return ''
}

function paneRoleFor(pane: 'viewer' | 'admin', mode: string): PaneRole {
  if (mode === 'split-viewer') return pane === 'viewer' ? 'primary' : 'side'
  if (mode === 'split-admin') return pane === 'admin' ? 'primary' : 'side'
  if (mode === 'viewer-only' && pane === 'viewer') return 'primary'
  if (mode === 'admin-only' && pane === 'admin') return 'primary'
  return null
}

function displayModeFor(
  pane: 'viewer' | 'admin',
  mode: string,
  breakpoint: string,
): DisplayMode {
  if (breakpoint === 'phone') return 'compact'
  const role = paneRoleFor(pane, mode)
  return role === 'side' ? 'compact' : 'full'
}

/** Per-pane breakpoint. Key principle: in split modes, the SIDE pane
 *  renders as if it were a phone (so admin/viewer content uses their
 *  phone layouts instead of a cramped desktop layout). The primary pane
 *  keeps the host breakpoint. */
function paneBreakpointFor(
  pane: 'viewer' | 'admin',
  mode: string,
  breakpoint: Breakpoint,
): Breakpoint {
  // If the whole viewport is phone, everything is phone.
  if (breakpoint === 'phone') return 'phone'
  const role = paneRoleFor(pane, mode)
  // In a split, the side pane is narrow — treat it as a phone so content
  // (MockAdmin chips + cards, compact Measure widget) uses the mobile
  // layout.
  if (role === 'side') return 'phone'
  return breakpoint
}
