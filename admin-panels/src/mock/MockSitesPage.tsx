import { useShellContext } from '@mightyspatial/app-shell'
import styles from './MockAdminShell.module.css'

const SITES = [
  { name: 'Forrest Airport', slug: 'forrest-airport', layers: 12, status: 'active' },
  { name: 'Perth CBD', slug: 'perth-cbd', layers: 34, status: 'active' },
  { name: 'Kalgoorlie Works', slug: 'kalgoorlie', layers: 7, status: 'active' },
  { name: 'North Shore Marina', slug: 'north-shore', layers: 4, status: 'draft' },
  { name: 'Dampier Port', slug: 'dampier-port', layers: 21, status: 'archived' },
]

function statusPill(status: string) {
  const cls =
    status === 'active'
      ? styles.pillGreen
      : status === 'draft'
        ? styles.pillAmber
        : styles.pillGray
  return <span className={`${styles.pill} ${cls}`}>{status}</span>
}

export function MockSitesPage() {
  const { breakpoint } = useShellContext()
  const isPhone = breakpoint === 'phone'

  return (
    <div>
      <div className={styles.mockBadge}>● Mock · read-only preview</div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Sites</h1>
        <p className={styles.pageDesc}>
          Digital twin sites registered in this instance. Tap one to manage
          layers, widgets, users, and branding.
        </p>
      </div>

      {isPhone ? (
        <div className={styles.cardList}>
          {SITES.map((s) => (
            <div key={s.slug} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{s.name}</h3>
                {statusPill(s.status)}
              </div>
              <div className={styles.cardMeta}>
                <code>{s.slug}</code> · {s.layers} layer{s.layers === 1 ? '' : 's'}
              </div>
            </div>
          ))}
        </div>
      ) : (
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
                <td>{statusPill(s.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
