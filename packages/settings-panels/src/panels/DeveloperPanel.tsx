import { usePersistedSettings } from '../hooks/usePersistedSettings'
import styles from '../SettingsShell.module.css'

/** Developer-only controls. When enabled, the shell reveals the
 *  breakpoint toggle, orientation toggle, widget debug overlays, and
 *  other dev affordances. Off by default in production builds so end
 *  users get a clean UI; always on by default in dev builds. */
export function DeveloperPanel() {
  const { settings, update } = usePersistedSettings()
  const { dev } = settings

  return (
    <div className={styles.panel}>
      <h2>Developer</h2>
      <p className={styles.panelDesc}>
        Turn on developer tools to show the breakpoint / orientation toggles
        in the top bar, widget debug overlays, and the Dev Tools variant of
        the Admin tab. Off by default for end users.
      </p>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Developer mode</span>
          <span className={styles.labelHint}>
            Reveals breakpoint + orientation toggles in the top bar, and
            exposes Dev Tools inside the Admin tab.
          </span>
        </label>
        <button
          type="button"
          aria-pressed={dev.enabled}
          className={`${styles.toggle} ${dev.enabled ? styles.toggleOn : ''}`}
          onClick={() => update({ dev: { enabled: !dev.enabled } })}
        />
      </div>
    </div>
  )
}
