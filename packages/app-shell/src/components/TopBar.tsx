import type { BrandProps, ViewMode, Breakpoint, Orientation } from '../types'
import styles from './TopBar.module.css'

interface TopBarProps {
  brand: BrandProps
  mode: ViewMode
  breakpoint: Breakpoint
  onModeChange: (mode: ViewMode) => void
  labels: { viewer: string; admin: string; settings: string }
  /** When true, hide the workspace brand button. Used when the brand
   *  has been moved into the CtrlPill floating bar (viewer mode) so
   *  the user doesn't see the wordmark twice. */
  hideBrand?: boolean
  /** Optional dev-only breakpoint override. */
  forcedBreakpoint?: Breakpoint | null
  onForcedBreakpointChange?: (bp: Breakpoint | null) => void
  forcedOrientation?: Orientation | null
  onForcedOrientationChange?: (o: Orientation | null) => void
}

/** Desktop/tablet top bar. Three flat tabs: Map, Atlas, Settings. */
export function TopBar({
  brand,
  mode,
  breakpoint,
  onModeChange,
  labels,
  hideBrand = false,
  forcedBreakpoint,
  onForcedBreakpointChange,
  forcedOrientation,
  onForcedOrientationChange,
}: TopBarProps) {
  if (breakpoint === 'phone') return null

  const Icon = brand.icon

  return (
    <header className={styles.topbar}>
      {!hideBrand && (
        <button type="button" className={styles.brand} onClick={brand.onClick}>
          {Icon ? <Icon size={20} /> : null}
          <span>{brand.name}</span>
        </button>
      )}

      <div className={styles.tabGroup} role="group" aria-label="Layout">
        <button
          type="button"
          className={`${styles.tabBtn} ${mode === 'viewer-only' ? styles.tabBtnActive : ''}`}
          onClick={() => onModeChange('viewer-only')}
          title={labels.viewer}
        >
          {labels.viewer}
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${mode === 'admin-only' ? styles.tabBtnActive : ''}`}
          onClick={() => onModeChange('admin-only')}
          title={labels.admin}
        >
          {labels.admin}
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${mode === 'settings' ? styles.tabBtnActive : ''}`}
          onClick={() => onModeChange('settings')}
          title={labels.settings}
        >
          {labels.settings}
        </button>
      </div>

      <div className={styles.spacer} />

      {onForcedBreakpointChange && (
        <div className={styles.bpGroup} role="group" aria-label="Breakpoint">
          <span className={styles.bpLabel} style={{ padding: '0 8px 0 4px' }}>
            Breakpoint
          </span>
          {(['phone', 'tablet', 'desktop'] as const).map((bp) => (
            <button
              key={bp}
              type="button"
              className={`${styles.bpBtn} ${forcedBreakpoint === bp ? styles.bpBtnActive : ''}`}
              onClick={() => onForcedBreakpointChange(forcedBreakpoint === bp ? null : bp)}
              title={
                forcedBreakpoint === bp
                  ? `Release ${bp} override (return to auto)`
                  : `Simulate ${bp} layout`
              }
            >
              {bp}
            </button>
          ))}
          {forcedBreakpoint && (
            <button
              type="button"
              className={styles.bpBtn}
              onClick={() => onForcedBreakpointChange(null)}
              title="Return to auto-detected breakpoint"
              style={{ opacity: 0.7 }}
            >
              auto
            </button>
          )}
        </div>
      )}

      {onForcedOrientationChange && breakpoint === 'tablet' && (
        <div className={styles.bpGroup} role="group" aria-label="Orientation">
          {(['portrait', 'landscape'] as const).map((o) => (
            <button
              key={o}
              type="button"
              className={`${styles.bpBtn} ${forcedOrientation === o ? styles.bpBtnActive : ''}`}
              onClick={() => onForcedOrientationChange(forcedOrientation === o ? null : o)}
              title={
                forcedOrientation === o
                  ? `Release ${o} override`
                  : `Simulate ${o} orientation`
              }
            >
              {o.slice(0, 1)}
            </button>
          ))}
        </div>
      )}
    </header>
  )
}
