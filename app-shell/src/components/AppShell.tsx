import { useEffect, useMemo } from 'react'
import type { AppShellProps, DisplayMode, PaneRole, ShellContextValue } from '../types'
import { ShellContextProvider } from '../context/ShellContext'
import { useBreakpoint } from '../hooks/useBreakpoint'
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
}: AppShellProps) {
  const { mode, setMode } = useViewMode()
  const breakpoint = useBreakpoint()

  const labels = {
    viewer: tabLabels?.viewer ?? 'Viewer',
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
  const layoutClass = useMemo(() => computeLayoutClass(mode, breakpoint), [mode, breakpoint])

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

  return (
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
        <MobileHeader brand={brand} />
      ) : (
        <TopBar
          brand={brand}
          mode={mode}
          breakpoint={breakpoint}
          onModeChange={setMode}
          labels={labels}
        />
      )}

      <div className={styles.body}>
        {/* Viewer surface — always rendered to preserve Cesium instance. */}
        <div
          ref={viewerObs.ref}
          className={`${styles.viewerSurface} ${!showViewer ? styles.viewerSurfaceHidden : ''}`}
        >
          <PaneContextProvider
            mode={mode}
            breakpoint={breakpoint}
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
              breakpoint={breakpoint}
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

      {breakpoint === 'phone' && (
        <MobileBottomNav mode={mode} onModeChange={setMode} labels={labels} />
      )}
    </div>
  )
}

function PaneContextProvider({
  mode,
  breakpoint,
  setMode,
  paneSize,
  paneRole,
  displayMode,
  children,
}: Omit<ShellContextValue, 'mode' | 'breakpoint' | 'setMode'> & {
  mode: ShellContextValue['mode']
  breakpoint: ShellContextValue['breakpoint']
  setMode: ShellContextValue['setMode']
  children: React.ReactNode
}) {
  const value: ShellContextValue = { mode, breakpoint, setMode, paneSize, paneRole, displayMode }
  return <ShellContextProvider value={value}>{children}</ShellContextProvider>
}

function computeLayoutClass(mode: string, bp: string): string {
  if (bp === 'phone') {
    if (mode === 'admin-only') return styles.phoneAdmin ?? ''
    if (mode === 'settings') return styles.phoneSettings ?? ''
    return styles.phoneViewer ?? ''
  }
  if (mode === 'split-viewer') {
    return bp === 'desktop' ? (styles.splitViewerDesktop ?? '') : (styles.splitViewerTablet ?? '')
  }
  if (mode === 'split-admin') {
    return bp === 'desktop' ? (styles.splitAdminDesktop ?? '') : (styles.splitAdminTablet ?? '')
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
