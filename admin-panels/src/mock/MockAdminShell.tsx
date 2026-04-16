import { useState } from 'react'
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

const ADMIN: NavItem[] = [
  { id: 'users', label: 'Users' },
]

/** Mock admin chrome mimicking MightyTwin's admin UI (desktop sidebar +
 *  section groupings). Purely visual — no state persisted, no API calls. */
export function MockAdminPage() {
  const [active, setActive] = useState<SectionId>('sites')
  const { update } = usePersistedSettings()

  return (
    <div className={styles.shell}>
      <button
        type="button"
        onClick={() => update({ admin: { view: 'dev-tools' } })}
        style={{
          position: 'absolute',
          top: 72,
          right: 28,
          padding: '6px 12px',
          borderRadius: 8,
          border: '1px solid rgba(245, 158, 11, 0.4)',
          background: 'rgba(245, 158, 11, 0.14)',
          color: '#fcd34d',
          font: 'inherit',
          fontSize: 12,
          cursor: 'pointer',
          zIndex: 10,
        }}
        title="Swap back to dev tools"
      >
        ← Dev Tools
      </button>
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
