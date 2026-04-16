import { usePersistedSettings } from '../hooks/usePersistedSettings'
import type { Density, ThemeMode } from '../types'
import styles from '../SettingsShell.module.css'

export function ThemePanel() {
  const { settings, update } = usePersistedSettings()
  const { theme } = settings

  return (
    <div className={styles.panel}>
      <h2>Theme & density</h2>
      <p className={styles.panelDesc}>
        Dark mode is the default for digital-twin workflows. Light and compact
        modes are placeholders for day-3 wiring.
      </p>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Theme</span>
          <span className={styles.labelHint}>Light mode lands day 3.</span>
        </label>
        <select
          className={styles.select}
          value={theme.mode}
          onChange={(e) => update({ theme: { mode: e.target.value as ThemeMode } })}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">Follow system</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Density</span>
          <span className={styles.labelHint}>Compact reclaims pixels for the globe.</span>
        </label>
        <select
          className={styles.select}
          value={theme.density}
          onChange={(e) => update({ theme: { density: e.target.value as Density } })}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </div>
    </div>
  )
}
