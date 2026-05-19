import { usePersistedSettings } from '../hooks/usePersistedSettings'
import styles from '../SettingsShell.module.css'

/** Settings panel for Probe — interior navigation.
 *
 *  See mockups/PROBE.md for the full spec. These are the workspace-wide
 *  defaults applied when a NavigableSpace doesn't specify its own values.
 */
export function ProbePanel() {
  const { settings, update } = usePersistedSettings()
  const { probe } = settings

  return (
    <div className={styles.panel}>
      <h2>Probe</h2>
      <p className={styles.panelDesc}>
        Interior navigation — pipes, rooms, pits, tunnels. The camera is treated
        as a point particle that respects walls. Drag the Probe glyph from the
        primary rail onto a navigable feature to enter.
      </p>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Default radius (m)</span>
          <span className={styles.labelHint}>
            Used as the cross-section radius when admin marks a feature as
            navigable without specifying one. Typical: 0.3 m for utility pipes,
            1.0 m for crawlspaces, 2 – 4 m for service tunnels.
          </span>
        </label>
        <input
          type="number"
          min={0.05}
          max={20}
          step={0.05}
          className={styles.input}
          value={probe.defaultRadius}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n) && n > 0) {
              update({ probe: { defaultRadius: n } })
            }
          }}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Damp threshold (m)</span>
          <span className={styles.labelHint}>
            Distance from the wall at which proximity damping starts. Higher =
            softer feel, damp kicks in sooner. Lower = camera can move freely
            until close to the surface.
          </span>
        </label>
        <input
          type="number"
          min={0.05}
          max={5}
          step={0.05}
          className={styles.input}
          value={probe.dampThreshold}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n) && n > 0) {
              update({ probe: { dampThreshold: n } })
            }
          }}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Yaw-only roll (natural feel)</span>
          <span className={styles.labelHint}>
            When on, camera roll springs back to local-up after each input —
            you can't end up upside-down inside a pipe. Off = free 6DOF
            (CAD-style). Default on.
          </span>
        </label>
        <button
          type="button"
          aria-pressed={probe.yawOnlyRoll}
          className={`${styles.toggle} ${probe.yawOnlyRoll ? styles.toggleOn : ''}`}
          onClick={() => update({ probe: { yawOnlyRoll: !probe.yawOnlyRoll } })}
        />
      </div>

      <p className={styles.panelFootnote}>
        Per-NavigableSpace overrides for radius / damp / roll are set in the
        admin Mark-navigable modal when annotating a feature.
      </p>
    </div>
  )
}
