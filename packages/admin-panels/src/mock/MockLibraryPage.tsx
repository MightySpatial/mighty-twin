import styles from './MockAdminShell.module.css'

const ITEMS = [
  { name: 'Runway centreline.style.json', type: 'style', updated: '2 hours ago' },
  { name: 'Space Angel story map', type: 'story-map', updated: 'yesterday' },
  { name: 'Terminal inspection walkthrough.mp4', type: 'video', updated: '3 days ago' },
  { name: 'Sector map — site overview.png', type: 'image', updated: 'Tue' },
  { name: 'Compliance report Q1.pdf', type: 'document', updated: '2 weeks ago' },
]

export function MockLibraryPage() {
  return (
    <div>
      <div className={styles.mockBadge}>● Mock · read-only preview</div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Library</h1>
        <p className={styles.pageDesc}>
          Shared media, styles, and documents available to every site. Drag in
          files or paste URLs to add.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        {ITEMS.map((it, i) => (
          <div
            key={i}
            style={{
              padding: 14,
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: 'rgba(255, 255, 255, 0.4)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 6,
              }}
            >
              {it.type}
            </div>
            <div style={{ fontSize: 13, color: '#fff', fontWeight: 500, marginBottom: 8 }}>
              {it.name}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.45)' }}>
              Updated {it.updated}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
