import type { BrandProps, ViewMode, Breakpoint } from '../types'
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
}: TopBarProps) {
  if (breakpoint === 'phone') return null

  const isSettingsTab = mode === 'settings'
  const onSettingsClick = () => {
    if (mode !== 'settings') onModeChange('settings')
  }

  const Icon = brand.icon

  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.brand} onClick={brand.onClick}>
        {Icon ? <Icon size={20} /> : null}
        <span>{brand.name}</span>
      </button>

      {/* Layout slider — the single source of truth for which pane(s) are
          visible. Desktop gets all four options (V / V+A / A+V / A);
          tablet and phone would get a simpler pair (see below). */}
      {breakpoint === 'desktop' &&
        (mode === 'viewer-only' ||
          mode === 'admin-only' ||
          mode === 'split-viewer' ||
          mode === 'split-admin') && (
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
        </div>
        )}

      {/* Tablet gets a simpler 2-way toggle (VIEWER / ADMIN). Split is
          available by deep-link (drawer overlay) but not exposed here to
          keep the bar honest at this size. */}
      {breakpoint === 'tablet' &&
        (mode === 'viewer-only' ||
          mode === 'admin-only' ||
          mode === 'split-viewer' ||
          mode === 'split-admin') && (
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
        </div>
      )}

      {/* Settings button — a peer to the layout slider, not a layout itself.
          Phone gets it via the bottom nav, so TopBar always renders it when
          visible (phone already early-returns at the top of the component). */}
      <button
        type="button"
        role="tab"
        aria-selected={isSettingsTab}
        className={`${styles.tab} ${isSettingsTab ? styles.tabActive : ''}`}
        onClick={onSettingsClick}
        title={isSettingsTab ? 'Close settings' : 'Open settings'}
      >
        ⚙ {labels.settings}
      </button>

      <div className={styles.spacer} />

      {onForcedBreakpointChange && import.meta.env.DEV && (
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
    </header>
  )
}
