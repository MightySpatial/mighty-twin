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
 * and is never unmounted — when in Atlas/Settings on desktop, it renders as
 * a floating phone-sized preview so map edits are visible live.
 */
export function AppShell({
  brand,
  viewer,
  adminContent,
  settingsContent,
  tabLabels,
  defaultMode = 'viewer-only',
  onModeChange,
  showDeveloperTools = false,
  rightRail = null,
  rightRailWidth = 360,
}: AppShellProps) {
  const { mode, setMode } = useViewMode()

  const [forcedBreakpoint, setForcedBreakpointState] = useState<Breakpoint | null>(() =>
    readForcedBreakpoint(),
  )
  const onForcedBreakpointChange = (bp: Breakpoint | null) => {
    setForcedBreakpointState(bp)
    writeForcedBreakpoint(bp)
  }

  const breakpoint = useBreakpoint({ override: forcedBreakpoint })

  const [forcedOrientation, setForcedOrientationState] = useState<Orientation | null>(() =>
    readForcedOrientation(),
  )
  const onForcedOrientationChange = (o: Orientation | null) => {
    setForcedOrientationState(o)
    writeForcedOrientation(o)
  }
  const orientation = useOrientation(forcedOrientation)

  const [chatSheetOpen, setChatSheetOpen] = useState(false)

  const labels = {
    viewer: tabLabels?.viewer ?? 'Map',
    admin: tabLabels?.admin ?? 'Admin',
    settings: tabLabels?.settings ?? 'Settings',
  }

  useEffect(() => {
    if (window.location.pathname === '/') {
      setMode(defaultMode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    onModeChange?.(mode)
  }, [mode, onModeChange])

  const layoutClass = useMemo(
    () => computeLayoutClass(mode, breakpoint),
    [mode, breakpoint],
  )

  // Phone: show one pane at a time. Desktop/tablet: viewer is always
  // rendered (full-screen in Map mode, mini-preview in Atlas/Settings).
  const isDesktopOrTablet = breakpoint !== 'phone'
  const showViewer =
    breakpoint === 'phone' ? mode === 'viewer-only' : true
  const showAdmin = mode === 'admin-only'
  const showSettings = mode === 'settings'
  const isPreview = isDesktopOrTablet && (mode === 'admin-only' || mode === 'settings')

  const viewerObs = useResizeObserver<HTMLDivElement>()
  const adminObs = useResizeObserver<HTMLDivElement>()

  const viewerPaneRole: PaneRole = mode === 'viewer-only' ? 'primary' : isPreview ? 'side' : null
  const viewerDisplayMode: DisplayMode =
    mode === 'viewer-only' && breakpoint !== 'phone' ? 'full' : 'compact'

  // On phone viewer-only mode the workspace brand has moved into the
  // CtrlPill floating bar — MobileHeader is suppressed and the grid
  // template drops the 48px header row (rootPhoneNoHeader) so the body
  // fills the freed space. Header stays on admin / settings.
  const hideMobileHeader = breakpoint === 'phone' && mode === 'viewer-only'
  const phoneRootClass = hideMobileHeader ? styles.rootPhoneNoHeader : styles.rootPhone

  const rootContent = (
    <div
      className={`${styles.root} ${breakpoint === 'phone' ? phoneRootClass : ''} ${layoutClass}`}
    >
      {breakpoint === 'phone' ? (
        hideMobileHeader ? null : (
          <MobileHeader
            brand={brand}
            forcedBreakpoint={forcedBreakpoint}
            onForcedBreakpointChange={showDeveloperTools ? onForcedBreakpointChange : undefined}
          />
        )
      ) : (
        <TopBar
          brand={brand}
          mode={mode}
          breakpoint={breakpoint}
          onModeChange={setMode}
          labels={labels}
          hideBrand={mode === 'viewer-only'}
          forcedBreakpoint={forcedBreakpoint}
          onForcedBreakpointChange={showDeveloperTools ? onForcedBreakpointChange : undefined}
          forcedOrientation={forcedOrientation}
          onForcedOrientationChange={showDeveloperTools ? onForcedOrientationChange : undefined}
        />
      )}

      <div className={styles.bodyShell}>
      <div className={styles.body}>
        {showAdmin && (
          <div ref={adminObs.ref} className={styles.adminPane}>
            <PaneContextProvider
              mode={mode}
              breakpoint={breakpoint}
              orientation={orientation}
              setMode={setMode}
              paneSize={adminObs.size}
              paneRole="primary"
              displayMode="full"
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

        {/* Viewer surface — mounted once, never unmounted, so the Cesium
            instance survives mode changes. In Atlas/Settings on desktop
            it shrinks to a floating phone-sized preview so map edits are
            visible live. */}
        <div
          ref={viewerObs.ref}
          className={`${styles.viewerSurface} ${
            isPreview ? styles.viewerSurfacePreview : ''
          } ${!showViewer ? styles.viewerSurfaceHidden : ''}`}
          aria-label={isPreview ? 'Live map preview' : undefined}
        >
          <PaneContextProvider
            mode={mode}
            breakpoint={isPreview ? 'phone' : breakpoint}
            orientation={orientation}
            setMode={setMode}
            paneSize={viewerObs.size}
            paneRole={viewerPaneRole}
            displayMode={viewerDisplayMode}
          >
            {viewer}
          </PaneContextProvider>
          {isPreview && (
            <div className={styles.previewLabel} aria-hidden>
              Live preview
            </div>
          )}
        </div>
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

      {rightRail && breakpoint === 'phone' && (
        <>
          <button
            type="button"
            className={styles.chatFab}
            aria-label="Open Mighty AI"
            onClick={() => setChatSheetOpen(true)}
          >
            <span className={styles.chatFabSparkle} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
                <path d="M19 15l.7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9L19 15z" />
              </svg>
            </span>
          </button>
          {chatSheetOpen && (
            <div
              className={styles.chatSheetBackdrop}
              onClick={() => setChatSheetOpen(false)}
            >
              <div
                className={styles.chatSheet}
                onClick={(e) => e.stopPropagation()}
              >
                <div className={styles.chatSheetHandle} />
                {rightRail}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )

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

function computeLayoutClass(mode: string, bp: string): string {
  if (bp === 'phone') {
    if (mode === 'admin-only') return styles.phoneAdmin ?? ''
    if (mode === 'settings') return styles.phoneSettings ?? ''
    return styles.phoneViewer ?? ''
  }
  return ''
}
