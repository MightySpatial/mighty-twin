import styles from './MockAdminShell.module.css'

const SITES = [
  { name: 'Forrest Airport', slug: 'forrest-airport', layers: 12, status: 'active' },
  { name: 'Perth CBD', slug: 'perth-cbd', layers: 34, status: 'active' },
  { name: 'Kalgoorlie Works', slug: 'kalgoorlie', layers: 7, status: 'active' },
  { name: 'North Shore Marina', slug: 'north-shore', layers: 4, status: 'draft' },
  { name: 'Dampier Port', slug: 'dampier-port', layers: 21, status: 'archived' },
]

export function MockSitesPage() {
  return (
    <div>
      <div className={styles.mockBadge}>● Mock · read-only preview</div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Sites</h1>
        <p className={styles.pageDesc}>
          Digital twin sites registered in this instance. Click one to manage
          layers, widgets, users, and branding.
        </p>
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Layers</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {SITES.map((s) => (
            <tr key={s.slug}>
              <td style={{ fontWeight: 500 }}>{s.name}</td>
              <td style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'ui-monospace' }}>
                {s.slug}
              </td>
              <td>{s.layers}</td>
              <td>
                <span
                  className={`${styles.pill} ${
                    s.status === 'active'
                      ? styles.pillGreen
                      : s.status === 'draft'
                        ? styles.pillAmber
                        : styles.pillGray
                  }`}
                >
                  {s.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
