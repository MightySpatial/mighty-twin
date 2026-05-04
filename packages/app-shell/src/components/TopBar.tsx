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

  // Middle "both panes" button — invertible. Clicking it while already in
  // split mode swaps which pane is primary (split-viewer ↔ split-admin),
  // and the rendered label flips so reading direction (left=primary)
  // matches the actual layout.
  const splitActive = mode === 'split-viewer' || mode === 'split-admin'
  const adminPrimary = mode === 'split-admin'
  const splitLeftLabel = adminPrimary ? labels.admin : labels.viewer
  const splitRightLabel = adminPrimary ? labels.viewer : labels.admin
  const handleSplitClick = () => {
    if (mode === 'split-viewer') return onModeChange('split-admin')
    if (mode === 'split-admin') return onModeChange('split-viewer')
    // Entering from a non-split mode: keep the side you came from primary.
    if (mode === 'admin-only') return onModeChange('split-admin')
    return onModeChange('split-viewer')
  }
  const splitTitle = splitActive
    ? `Swap — ${adminPrimary ? labels.viewer : labels.admin} primary`
    : `${labels.viewer} + ${labels.admin} side by side`

  return (
    <header className={styles.topbar}>
      <button type="button" className={styles.brand} onClick={brand.onClick}>
        {Icon ? <Icon size={20} /> : null}
        <span>{brand.name}</span>
      </button>

      {/* Layout slider — three positions for the Map↔Atlas axis:
          [Map] [Map | Atlas] [Atlas]   ·   ⚙ Settings
          The middle button is "both panes visible" and invertible — see
          handleSplitClick above. Phone gets a [Map][Atlas][Settings]
          bottom nav — handled upstream by MobileBottomNav, not here. */}
      <div className={styles.splitGroup} role="group" aria-label="Layout">
        <button
          type="button"
          className={`${styles.splitBtn} ${mode === 'viewer-only' ? styles.splitBtnActive : ''}`}
          onClick={() => onModeChange('viewer-only')}
          title={`${labels.viewer} only`}
        >
          {labels.viewer}
        </button>
        <button
          type="button"
          className={`${styles.splitBtn} ${styles.splitBtnDual} ${
            splitActive ? styles.splitBtnActive : ''
          }`}
          onClick={handleSplitClick}
          title={splitTitle}
          aria-label={`${splitLeftLabel} and ${splitRightLabel}${
            splitActive ? ' — click to swap' : ''
          }`}
        >
          <span>{splitLeftLabel}</span>
          <span className={styles.splitDivider} aria-hidden>|</span>
          <span>{splitRightLabel}</span>
        </button>
        <button
          type="button"
          className={`${styles.splitBtn} ${mode === 'admin-only' ? styles.splitBtnActive : ''}`}
          onClick={() => onModeChange('admin-only')}
          title={`${labels.admin} only`}
        >
          {labels.admin}
        </button>
      </div>

      {/* Settings — separate from the layout slider since it isn't on the
          Map↔Atlas axis. Gear icon + label. */}
      <button
        type="button"
        className={`${styles.settingsBtn} ${mode === 'settings' ? styles.settingsBtnActive : ''}`}
        onClick={() => onModeChange('settings')}
        title="Settings"
      >
        ⚙ {labels.settings}
      </button>

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
