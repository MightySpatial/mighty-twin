import { usePersistedSettings } from '../hooks/usePersistedSettings'
import styles from '../SettingsShell.module.css'

export function WidgetHostPanel() {
  const { settings, update } = usePersistedSettings()
  const { widgets } = settings

  return (
    <div className={styles.panel}>
      <h2>Widget host</h2>
      <p className={styles.panelDesc}>
        Toggle widgets on and off, and turn on debug overlays showing widget
        placement boundaries.
      </p>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Debug overlays</span>
          <span className={styles.labelHint}>Show placement boxes around each widget.</span>
        </label>
        <button
          type="button"
          aria-pressed={widgets.showDebugOverlays}
          className={`${styles.toggle} ${widgets.showDebugOverlays ? styles.toggleOn : ''}`}
          onClick={() =>
            update({ widgets: { showDebugOverlays: !widgets.showDebugOverlays } })
          }
        />
      </div>

      <p className={styles.skeletonNote}>
        Day-1 skeleton — per-widget enable/disable toggles ship on day 3.
      </p>
    </div>
  )
}
