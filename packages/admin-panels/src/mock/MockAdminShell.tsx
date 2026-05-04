import { useState } from 'react'
import { useShellContext } from '@mightyspatial/app-shell'
import { usePersistedSettings } from '@mightyspatial/settings-panels'
import styles from './MockAdminShell.module.css'
import { MockSitesPage } from './MockSitesPage'
import { MockUsersPage } from './MockUsersPage'
import { MockDataPage } from './MockDataPage'
import { MockLibraryPage } from './MockLibraryPage'

type SectionId = 'sites' | 'users' | 'data' | 'library'

interface NavItem {
  id: SectionId
  label: string
}

const MAIN: NavItem[] = [
  { id: 'sites', label: 'Sites' },
  { id: 'data', label: 'Data sources' },
  { id: 'library', label: 'Library' },
]

const ADMIN: NavItem[] = [{ id: 'users', label: 'Users' }]

/** Mock admin chrome mimicking MightyTwin's admin UI.
 *
 * Desktop: 220 px left sidebar with section groupings.
 * Tablet: same sidebar, slightly narrower.
 * Phone: sidebar collapses to a horizontal scroll-chip strip above the
 *   content — decided by the shell's reported breakpoint (not a CSS media
 *   query) so forced-breakpoint previews work. */
export function MockAdminPage() {
  const [active, setActive] = useState<SectionId>('sites')
  const { update } = usePersistedSettings()
  const { breakpoint } = useShellContext()
  const isPhone = breakpoint === 'phone'

  const navItems: NavItem[] = [...MAIN, ...ADMIN]

  const backButton = (
    <button
      type="button"
      onClick={() => update({ admin: { view: 'dev-tools' } })}
      style={{
        position: 'absolute',
        top: isPhone ? 12 : 72,
        right: isPhone ? 12 : 28,
        padding: '6px 12px',
        borderRadius: 8,
        border: '1px solid rgba(245, 158, 11, 0.4)',
        background: 'rgba(245, 158, 11, 0.14)',
        color: '#fcd34d',
        font: 'inherit',
        fontSize: 11,
        cursor: 'pointer',
        zIndex: 10,
      }}
      title="Swap back to dev tools"
    >
      ← Dev Tools
    </button>
  )

  if (isPhone) {
    return (
      <div className={styles.phoneShell}>
        {backButton}
        <nav className={styles.phoneNav} role="tablist">
          {navItems.map((i) => (
            <button
              key={i.id}
              type="button"
              role="tab"
              aria-selected={i.id === active}
              className={`${styles.phoneNavItem} ${
                i.id === active ? styles.phoneNavItemActive : ''
              }`}
              onClick={() => setActive(i.id)}
            >
              {i.label}
            </button>
          ))}
        </nav>
        <main className={styles.phoneContent}>
          {active === 'sites' && <MockSitesPage />}
          {active === 'users' && <MockUsersPage />}
          {active === 'data' && <MockDataPage />}
          {active === 'library' && <MockLibraryPage />}
        </main>
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      {backButton}
      <aside className={styles.sidebar}>
        <h3 className={styles.sidebarTitle}>Admin</h3>

        <div className={styles.navSection}>
          <h4 className={styles.navHeader}>Main</h4>
          {MAIN.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`${styles.navItem} ${i.id === active ? styles.navItemActive : ''}`}
              onClick={() => setActive(i.id)}
            >
              <span className={styles.dot} />
              {i.label}
            </button>
          ))}
        </div>

        <div className={styles.navSection}>
          <h4 className={styles.navHeader}>People</h4>
          {ADMIN.map((i) => (
            <button
              key={i.id}
              type="button"
              className={`${styles.navItem} ${i.id === active ? styles.navItemActive : ''}`}
              onClick={() => setActive(i.id)}
            >
              <span className={styles.dot} />
              {i.label}
            </button>
          ))}
        </div>
      </aside>

      <main className={styles.content}>
        {active === 'sites' && <MockSitesPage />}
        {active === 'users' && <MockUsersPage />}
        {active === 'data' && <MockDataPage />}
        {active === 'library' && <MockLibraryPage />}
      </main>
    </div>
  )
}
