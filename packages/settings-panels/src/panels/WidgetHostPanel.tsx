import { usePersistedSettings } from '../hooks/usePersistedSettings'
import styles from '../SettingsShell.module.css'

/** All widgets that can be toggled on / off via client-side settings.
 *  IDs MUST mirror the canonical registry in
 *  apps/web/src/viewer/components/MapShell/widgetRegistry.ts.
 *  Inline widgets (zoom, gimbal) are excluded since they're never
 *  user-toggleable. Keep this list in lockstep with DEFAULT_WIDGETS. */
const WIDGET_CATALOG: { id: string; label: string; desc: string; rail: 'primary' | 'secondary' }[] = [
  { id: 'search',  label: 'Search',  desc: 'Address and feature search with fly-to.', rail: 'primary' },
  { id: 'measure', label: 'Measure', desc: 'Point-to-point distance and area measurement.', rail: 'primary' },
  { id: 'layers',  label: 'Layers',  desc: 'Layer visibility, opacity, and order panel.', rail: 'primary' },
  { id: 'legend',  label: 'Legend',  desc: 'Auto-generated colour and symbol legend.', rail: 'primary' },
  { id: 'table',   label: 'Table',   desc: 'Attribute table for filtered feature inspection.', rail: 'primary' },
  { id: 'story',   label: 'Story',   desc: 'Guided story-map narrative player.', rail: 'secondary' },
  { id: 'snap',    label: 'Snap',    desc: 'Capture and share screenshots of the viewer.', rail: 'secondary' },
  { id: 'design',  label: 'Create',  desc: 'Draw and annotate features on the map.', rail: 'secondary' },
  { id: 'terrain', label: 'Terrain', desc: 'Globe transparency and underground floor controls.', rail: 'secondary' },
  { id: 'fly',     label: 'Fly',     desc: 'Free-flight camera with keyboard controls.', rail: 'secondary' },
]

const PRIMARY = WIDGET_CATALOG.filter((w) => w.rail === 'primary')
const SECONDARY = WIDGET_CATALOG.filter((w) => w.rail === 'secondary')

export function WidgetHostPanel() {
  const { settings, update } = usePersistedSettings()
  const { widgets } = settings

  function isEnabled(id: string): boolean {
    return widgets.enabled[id] !== false
  }

  function toggleWidget(id: string) {
    update({
      widgets: {
        enabled: { ...widgets.enabled, [id]: !isEnabled(id) },
      },
    })
  }

  const enabledCount = WIDGET_CATALOG.filter((w) => isEnabled(w.id)).length

  return (
    <div className={styles.panel}>
      <h2>Widget host</h2>
      <p className={styles.panelDesc}>
        Enable or disable viewer widgets. Changes take effect immediately — no
        reload needed. Disabled widgets disappear from the viewer entirely.
      </p>

      {/* Primary rail */}
      <section className={styles.widgetSection}>
        <div className={styles.widgetSectionHeader}>
          <span className={styles.widgetSectionLabel}>Primary rail</span>
          <span className={styles.widgetSectionHint}>Floating icon stack on the map edge</span>
        </div>
        <div className={styles.widgetGrid}>
          {PRIMARY.map((w) => {
            const on = isEnabled(w.id)
            return (
              <label
                key={w.id}
                className={`${styles.widgetToggleCard} ${on ? styles.widgetToggleCardOn : ''}`}
              >
                <div className={styles.widgetToggleCardBody}>
                  <span className={styles.widgetToggleCardName}>{w.label}</span>
                  <span className={styles.widgetToggleCardDesc}>{w.desc}</span>
                </div>
                <input
                  type="checkbox"
                  className={styles.srOnly}
                  checked={on}
                  onChange={() => toggleWidget(w.id)}
                />
                <span className={`${styles.togglePill} ${on ? styles.togglePillOn : ''}`}>
                  <span className={styles.toggleKnob} />
                </span>
              </label>
            )
          })}
        </div>
      </section>

      {/* Secondary rail */}
      <section className={styles.widgetSection}>
        <div className={styles.widgetSectionHeader}>
          <span className={styles.widgetSectionLabel}>Secondary rail</span>
          <span className={styles.widgetSectionHint}>Specialist tools</span>
        </div>
        <div className={styles.widgetGrid}>
          {SECONDARY.map((w) => {
            const on = isEnabled(w.id)
            return (
              <label
                key={w.id}
                className={`${styles.widgetToggleCard} ${on ? styles.widgetToggleCardOn : ''}`}
              >
                <div className={styles.widgetToggleCardBody}>
                  <span className={styles.widgetToggleCardName}>{w.label}</span>
                  <span className={styles.widgetToggleCardDesc}>{w.desc}</span>
                </div>
                <input
                  type="checkbox"
                  className={styles.srOnly}
                  checked={on}
                  onChange={() => toggleWidget(w.id)}
                />
                <span className={`${styles.togglePill} ${on ? styles.togglePillOn : ''}`}>
                  <span className={styles.toggleKnob} />
                </span>
              </label>
            )
          })}
        </div>
      </section>

      {/* Debug overlays */}
      <div className={styles.field} style={{ marginTop: 8 }}>
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

      <p className={styles.panelFootnote}>
        {enabledCount} of {WIDGET_CATALOG.length} widgets enabled.
        Workspace admins can further constrain widgets via Settings → Widgets.
      </p>
    </div>
  )
}
