import { useShellContext } from '@mightyspatial/app-shell'
import styles from './MockAdminShell.module.css'

const USERS = [
  { name: 'Rahman Schionning', email: 'rahman@mightyspatial.com', role: 'admin', status: 'active' },
  { name: 'Ram · Space Angel', email: 'ram@spaceangel.io', role: 'creator', status: 'active' },
  { name: 'Locaters · Mariko', email: 'mariko@locaters.com.au', role: 'viewer', status: 'active' },
  { name: 'Dave Mares', email: 'dave@corespatial.au', role: 'viewer', status: 'invited' },
  { name: 'Anthony Butler', email: 'anthony@ediom.com', role: 'viewer', status: 'invited' },
]

const rolePill = (role: string) => (
  <span
    className={`${styles.pill} ${
      role === 'admin' ? styles.pillRose : role === 'creator' ? styles.pillBlue : styles.pillGray
    }`}
  >
    {role}
  </span>
)
const statusPill = (status: string) => (
  <span className={`${styles.pill} ${status === 'active' ? styles.pillGreen : styles.pillAmber}`}>
    {status}
  </span>
)

export function MockUsersPage() {
  const { breakpoint } = useShellContext()
  const isPhone = breakpoint === 'phone'

  return (
    <div>
      <div className={styles.mockBadge}>● Mock · read-only preview</div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Users</h1>
        <p className={styles.pageDesc}>
          People with access to this instance. Roles control what they can
          see and edit.
        </p>
      </div>

      {isPhone ? (
        <div className={styles.cardList}>
          {USERS.map((u) => (
            <div key={u.email} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{u.name}</h3>
                {statusPill(u.status)}
              </div>
              <div className={styles.cardMeta}>{u.email}</div>
              <div style={{ marginTop: 8 }}>{rolePill(u.role)}</div>
            </div>
          ))}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((u) => (
              <tr key={u.email}>
                <td style={{ fontWeight: 500 }}>{u.name}</td>
                <td style={{ color: 'rgba(255,255,255,0.6)' }}>{u.email}</td>
                <td>{rolePill(u.role)}</td>
                <td>{statusPill(u.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
