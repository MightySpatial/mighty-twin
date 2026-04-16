import styles from './MockAdminShell.module.css'

const USERS = [
  { name: 'Rahman Schionning', email: 'rahman@mightyspatial.com', role: 'admin', status: 'active' },
  { name: 'Ram · Space Angel', email: 'ram@spaceangel.io', role: 'creator', status: 'active' },
  { name: 'Locaters · Mariko', email: 'mariko@locaters.com.au', role: 'viewer', status: 'active' },
  { name: 'Dave Mares', email: 'dave@corespatial.au', role: 'viewer', status: 'invited' },
  { name: 'Anthony Butler', email: 'anthony@ediom.com', role: 'viewer', status: 'invited' },
]

export function MockUsersPage() {
  return (
    <div>
      <div className={styles.mockBadge}>● Mock · read-only preview</div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Users</h1>
        <p className={styles.pageDesc}>
          People with access to this instance. Roles control what they can see
          and edit.
        </p>
      </div>
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
              <td>
                <span
                  className={`${styles.pill} ${u.role === 'admin' ? styles.pillRose : u.role === 'creator' ? styles.pillBlue : styles.pillGray}`}
                >
                  {u.role}
                </span>
              </td>
              <td>
                <span
                  className={`${styles.pill} ${u.status === 'active' ? styles.pillGreen : styles.pillAmber}`}
                >
                  {u.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
