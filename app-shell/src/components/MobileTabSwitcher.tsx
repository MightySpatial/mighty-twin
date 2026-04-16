import type { Breakpoint, BrandProps, ViewMode } from '../types'
import styles from './MobileTabSwitcher.module.css'

interface MobileTabSwitcherProps {
  brand: BrandProps
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  labels: { viewer: string; admin: string; settings: string }
}

/** Phone-only top header + bottom tab nav. Split modes collapse to viewer tab
 *  (URL preserved, UI shows viewer). In dev, the breakpoint toggle is shown
 *  so devs can "escape" phone mode without resizing the browser. */
export function MobileHeader({
  brand,
  forcedBreakpoint,
  onForcedBreakpointChange,
}: {
  brand: BrandProps
  forcedBreakpoint?: Breakpoint | null
  onForcedBreakpointChange?: (bp: Breakpoint | null) => void
}) {
  const Icon = brand.icon
  return (
    <div className={styles.mobileHeader}>
      {Icon ? <Icon size={18} className="brand-icon" /> : null}
      <span style={{ marginLeft: Icon ? 8 : 0, flex: 1 }}>{brand.name}</span>
      {onForcedBreakpointChange && import.meta.env.DEV && (
        <div style={{ display: 'flex', gap: 4, fontSize: 10, textTransform: 'uppercase' }}>
          {(['phone', 'tablet', 'desktop'] as const).map((bp) => (
            <button
              key={bp}
              type="button"
              onClick={() => onForcedBreakpointChange(forcedBreakpoint === bp ? null : bp)}
              style={{
                padding: '3px 7px',
                borderRadius: 5,
                border: '1px solid rgba(255,255,255,0.08)',
                background: forcedBreakpoint === bp ? '#22c55e' : 'transparent',
                color: forcedBreakpoint === bp ? '#0f0f14' : 'rgba(255,255,255,0.5)',
                fontWeight: forcedBreakpoint === bp ? 600 : 400,
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              {bp.charAt(0)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function MobileBottomNav({
  mode,
  onModeChange,
  labels,
}: Omit<MobileTabSwitcherProps, 'brand'>) {
  const isViewer = mode === 'viewer-only' || mode === 'split-viewer' || mode === 'split-admin'
  const isAdmin = mode === 'admin-only'
  const isSettings = mode === 'settings'

  return (
    <nav className={styles.bottomNav} role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={isViewer && !isAdmin && !isSettings}
        className={`${styles.tab} ${isViewer && !isAdmin && !isSettings ? styles.tabActive : ''}`}
        onClick={() => onModeChange('viewer-only')}
      >
        <span className={styles.dot} />
        <span>{labels.viewer}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isAdmin}
        className={`${styles.tab} ${isAdmin ? styles.tabActive : ''}`}
        onClick={() => onModeChange('admin-only')}
      >
        <span className={styles.dot} />
        <span>{labels.admin}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={isSettings}
        className={`${styles.tab} ${isSettings ? styles.tabActive : ''}`}
        onClick={() => onModeChange('settings')}
      >
        <span className={styles.dot} />
        <span>{labels.settings}</span>
      </button>
    </nav>
  )
}
