import { useShellContext } from '@mightyspatial/app-shell'
import styles from './MockAdminShell.module.css'

const SOURCES = [
  { name: 'Runway polygons', type: 'vector', format: 'GeoJSON', size: '214 KB', status: 'ready' },
  { name: 'Terminal buildings', type: '3d-tiles', format: '3D Tiles', size: '18.2 MB', status: 'ready' },
  { name: 'Bore-hole samples', type: 'vector', format: 'Shapefile', size: '1.8 MB', status: 'ready' },
  { name: 'Satellite orthomosaic', type: 'raster', format: 'COG', size: '142 MB', status: 'processing' },
  { name: 'BIM – terminal-A.ifc', type: 'ifc', format: 'IFC 4.3', size: '88 MB', status: 'ready' },
  { name: 'Apron-scan-2026-03.laz', type: 'pointcloud', format: 'LAS/LAZ', size: '2.1 GB', status: 'uploading' },
]

const statusPill = (status: string) => {
  const cls =
    status === 'ready'
      ? styles.pillGreen
      : status === 'processing'
        ? styles.pillBlue
        : status === 'uploading'
          ? styles.pillAmber
          : styles.pillGray
  return <span className={`${styles.pill} ${cls}`}>{status}</span>
}

export function MockDataPage() {
  const { breakpoint } = useShellContext()
  const isPhone = breakpoint === 'phone'

  return (
    <div>
      <div className={styles.mockBadge}>● Mock · read-only preview</div>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Data sources</h1>
        <p className={styles.pageDesc}>
          Raw spatial datasets ingested into this instance. Used by site
          layers to drive what the viewer renders.
        </p>
      </div>

      {isPhone ? (
        <div className={styles.cardList}>
          {SOURCES.map((s, i) => (
            <div key={i} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>{s.name}</h3>
                {statusPill(s.status)}
              </div>
              <div className={styles.cardMeta}>
                <code>{s.type}</code> · {s.format} · {s.size}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Format</th>
              <th>Size</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((s, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'ui-monospace' }}>
                  {s.type}
                </td>
                <td style={{ color: 'rgba(255,255,255,0.6)' }}>{s.format}</td>
                <td style={{ color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>
                  {s.size}
                </td>
                <td>{statusPill(s.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
