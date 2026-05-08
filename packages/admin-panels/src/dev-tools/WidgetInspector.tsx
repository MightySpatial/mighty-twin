import { getWidgets } from '@mightyspatial/widget-host'
import styles from './WidgetInspector.module.css'

/** Lists every widget registered with @mightyspatial/widget-host and shows
 *  its manifest fields. Updates on re-render, so toggling widgets in the
 *  settings panel is reflected here. */
export function WidgetInspector() {
  const widgets = getWidgets()

  if (widgets.length === 0) {
    return (
      <div className={styles.empty}>
        No widgets registered. Call <code>registerWidget()</code> at app boot.
      </div>
    )
  }

  return (
    <div className={styles.inspector}>
      {widgets.map((w) => (
        <div key={w.id} className={styles.widgetCard}>
          <div className={styles.widgetHeader}>
            <h3 className={styles.widgetName}>{w.name}</h3>
            <span className={styles.widgetVersion}>v{w.version}</span>
          </div>
          {w.description && <p className={styles.widgetDesc}>{w.description}</p>}
          <div className={styles.metaRow}>
            <span className={styles.metaLabel}>ID</span>
            <span className={styles.metaValue}>{w.id}</span>
            <span className={styles.metaLabel}>Placement</span>
            <span className={styles.metaValue}>{w.placement}</span>
            {w.requires && w.requires.length > 0 && (
              <>
                <span className={styles.metaLabel}>Requires</span>
                <span className={styles.metaValue}>{w.requires.join(', ')}</span>
              </>
            )}
            {w.minWidth !== undefined && (
              <>
                <span className={styles.metaLabel}>Min width</span>
                <span className={styles.metaValue}>{w.minWidth}px</span>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
