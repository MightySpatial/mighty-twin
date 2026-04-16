import { usePersistedSettings } from '../hooks/usePersistedSettings'
import type { CoordinateFormat, LengthUnit } from '../types'
import styles from '../SettingsShell.module.css'

export function UnitsPanel() {
  const { settings, update } = usePersistedSettings()
  const { units } = settings

  return (
    <div className={styles.panel}>
      <h2>Units & formatting</h2>
      <p className={styles.panelDesc}>
        Controls how the Measure widget and other tools display values.
      </p>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Length</span>
          <span className={styles.labelHint}>Affects distance and area readouts.</span>
        </label>
        <select
          className={styles.select}
          value={units.length}
          onChange={(e) => update({ units: { length: e.target.value as LengthUnit } })}
        >
          <option value="metric">Metric (m, km, km²)</option>
          <option value="imperial">Imperial (ft, mi, mi²)</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Coordinate format</span>
          <span className={styles.labelHint}>Displayed next to picked points.</span>
        </label>
        <select
          className={styles.select}
          value={units.coordinates}
          onChange={(e) =>
            update({ units: { coordinates: e.target.value as CoordinateFormat } })
          }
        >
          <option value="dd">Decimal degrees (115.86°, -31.96°)</option>
          <option value="dms">Degrees-minutes-seconds</option>
          <option value="mgrs">MGRS</option>
        </select>
      </div>

      <p className={styles.skeletonNote}>
        Day-1 skeleton — Measure widget adapts to these values from day 3.
      </p>
    </div>
  )
}
