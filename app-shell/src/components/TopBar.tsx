import type { BrandProps, ViewMode, Breakpoint, Orientation } from '../types'
import styles from './TopBar.module.css'

interface TopBarProps {
  brand: BrandProps
  mode: ViewMode
  breakpoint: Breakpoint
  onModeChange: (mode: ViewMode) => void
  labels: { viewer: string; admin: string; settings: string }
  /** Optional dev-only breakpoint override. When set, an extra toggle group
   *  appears in the top bar so developers can flip between phone / tablet /
   *  desktop layouts without resizing the browser. */
  forcedBreakpoint?: Breakpoint | null
  onForcedBreakpointChange?: (bp: Breakpoint | null) => void
  /** Dev-only orientation override (meaningful on tablet). */
  forcedOrientation?: Orientation | null
  onForcedOrientationChange?: (o: Orientation | null) => void
}

/** Desktop/tablet top bar. Renders brand + three tabs + split-mode toggle.
 *  Phone layout omits the bar entirely (handled by MobileTabSwitcher). */
export function TopBar({
  brand,
  mode,
  breakpoint,
  onModeChange,
  labels,
  forcedBreakpoint,
  onForcedBreakpointChange,
  forcedOrientation,
  onForcedOrientationChange,
}: TopBarProps) {
  if (breakpoint === 'phone') return null

  const Icon = brand.icon

  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.brand} onClick={brand.onClick}>
        {Icon ? <Icon size={20} /> : null}
        <span>{brand.name}</span>
      </button>

      {/* Layout slider — the single source of truth for every display
          mode, including Settings. Five buttons end-to-end:
          [V] [V+A] [A+V] [A] [⚙ S]
          Desktop shows all five; tablet collapses V+A/A+V to a 3-button
          strip (Viewer / Admin / Settings) since split becomes an overlay
          drawer there rather than a first-class layout. */}
      {breakpoint === 'desktop' && (
        <div className={styles.splitGroup} role="group" aria-label="Layout">
          <button
            type="button"
            className={`${styles.splitBtn} ${mode === 'viewer-only' ? styles.splitBtnActive : ''}`}
            onClick={() => onModeChange('viewer-only')}
            title="Viewer only"
          >
            Viewer
          </button>
          <button
            type="button"
            className={`${styles.splitBtn} ${mode === 'split-viewer' ? styles.splitBtnActive : ''}`}
            onClick={() => onModeChange('split-viewer')}
            title="Viewer + Admin side pane"
          >
            V+A
          </button>
          <button
            type="button"
            className={`${styles.splitBtn} ${mode === 'split-admin' ? styles.splitBtnActive : ''}`}
            onClick={() => onModeChange('split-admin')}
            title="Admin + Viewer side pane"
          >
            A+V
          </button>
          <button
            type="button"
            className={`${styles.splitBtn} ${mode === 'admin-only' ? styles.splitBtnActive : ''}`}
            onClick={() => onModeChange('admin-only')}
            title="Admin only"
          >
            Admin
          </button>
          <button
            type="button"
            className={`${styles.splitBtn} ${mode === 'settings' ? styles.splitBtnActive : ''}`}
            onClick={() => onModeChange('settings')}
            title="Settings"
          >
            ⚙ {labels.settings}
          </button>
        </div>
      )}

      {/* Tablet: 3-button strip (Viewer / Admin / Settings). Split is
          available by deep-link (drawer overlay) but not exposed here. */}
      {breakpoint === 'tablet' && (
        <div className={styles.splitGroup} role="group" aria-label="Layout">
          <button
            type="button"
            className={`${styles.splitBtn} ${
              mode === 'viewer-only' || mode === 'split-viewer' ? styles.splitBtnActive : ''
            }`}
            onClick={() => onModeChange('viewer-only')}
            title="Viewer"
          >
            Viewer
          </button>
          <button
            type="button"
            className={`${styles.splitBtn} ${
              mode === 'admin-only' || mode === 'split-admin' ? styles.splitBtnActive : ''
            }`}
            onClick={() => onModeChange('admin-only')}
            title="Admin"
          >
            Admin
          </button>
          <button
            type="button"
            className={`${styles.splitBtn} ${mode === 'settings' ? styles.splitBtnActive : ''}`}
            onClick={() => onModeChange('settings')}
            title="Settings"
          >
            ⚙ {labels.settings}
          </button>
        </div>
      )}

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

      {/* Orientation toggle — only meaningful on tablet (portrait-mode
          tablets stack split panes vertically instead of overlaying a
          drawer). Gated on showDeveloperTools via the parent prop. */}
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
