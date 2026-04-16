import type { BrandProps, ViewMode, Breakpoint } from '../types'
import styles from './TopBar.module.css'

interface TopBarProps {
  brand: BrandProps
  mode: ViewMode
  breakpoint: Breakpoint
  onModeChange: (mode: ViewMode) => void
  labels: { viewer: string; admin: string; settings: string }
}

/** Desktop/tablet top bar. Renders brand + three tabs + split-mode toggle.
 *  Phone layout omits the bar entirely (handled by MobileTabSwitcher). */
export function TopBar({ brand, mode, breakpoint, onModeChange, labels }: TopBarProps) {
  if (breakpoint === 'phone') return null

  const isViewerTab = mode === 'viewer-only' || mode === 'split-viewer' || mode === 'split-admin'
  const isAdminTab = mode === 'admin-only' || mode === 'split-viewer' || mode === 'split-admin'
  const isSettingsTab = mode === 'settings'

  // When the user clicks a tab from a non-split mode, switch to that tab's
  // fullscreen variant. When already in a split, clicking a tab that's in the
  // split is a no-op; clicking the other side flips focus.
  const onViewerClick = () => {
    if (mode === 'split-admin') onModeChange('split-viewer')
    else if (mode !== 'viewer-only' && mode !== 'split-viewer') onModeChange('viewer-only')
  }
  const onAdminClick = () => {
    if (mode === 'split-viewer') onModeChange('split-admin')
    else if (mode !== 'admin-only' && mode !== 'split-admin') onModeChange('admin-only')
  }
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

      <nav className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={isViewerTab && !isSettingsTab}
          className={`${styles.tab} ${isViewerTab && !isSettingsTab ? styles.tabActive : ''}`}
          onClick={onViewerClick}
        >
          {labels.viewer}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isAdminTab && !isSettingsTab}
          className={`${styles.tab} ${isAdminTab && !isSettingsTab ? styles.tabActive : ''}`}
          onClick={onAdminClick}
        >
          {labels.admin}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isSettingsTab}
          className={`${styles.tab} ${isSettingsTab ? styles.tabActive : ''}`}
          onClick={onSettingsClick}
        >
          {labels.settings}
        </button>
      </nav>

      {(mode === 'viewer-only' ||
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

      <div className={styles.spacer} />
    </header>
  )
}
