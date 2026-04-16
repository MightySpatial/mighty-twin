import type { BrandProps, ViewMode } from '../types'
import styles from './MobileTabSwitcher.module.css'

interface MobileTabSwitcherProps {
  brand: BrandProps
  mode: ViewMode
  onModeChange: (mode: ViewMode) => void
  labels: { viewer: string; admin: string; settings: string }
}

/** Phone-only top header + bottom tab nav. Split modes collapse to viewer tab
 *  (URL preserved, UI shows viewer). */
export function MobileHeader({ brand }: { brand: BrandProps }) {
  const Icon = brand.icon
  return (
    <div className={styles.mobileHeader}>
      {Icon ? <Icon size={18} className="brand-icon" /> : null}
      <span style={{ marginLeft: Icon ? 8 : 0 }}>{brand.name}</span>
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
