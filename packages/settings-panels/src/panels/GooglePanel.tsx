import { usePersistedSettings } from '../hooks/usePersistedSettings'
import styles from '../SettingsShell.module.css'

/** Settings panel for Google Maps Platform integration.
 *
 *  The API key is stored in localStorage via the shared settings system.
 *  Workspace-level / server-side keys live in admin Branding settings and
 *  take precedence when set (see apps/web/src/admin/pages/SystemSettingsPage).
 *
 *  Quota / cost note: Street View API is paid per panorama load. Each tile
 *  click that resolves a panorama counts against the Google Maps Platform
 *  bill. The user is responsible for their own key + quotas.
 */
export function GooglePanel() {
  const { settings, update } = usePersistedSettings()
  const { google } = settings

  return (
    <div className={styles.panel}>
      <h2>Google</h2>
      <p className={styles.panelDesc}>
        Google Maps Platform integration. Required for Street View. The key is
        stored locally in this browser; for shared workspaces, set a server-side
        override under admin → Branding.{' '}
        <a
          href="https://developers.google.com/maps/documentation/javascript/get-api-key"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get a key →
        </a>
      </p>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>
            Maps API key{' '}
            <span className={styles.reloadBadge}>Reload</span>
          </span>
          <span className={styles.labelHint}>
            Restrict the key to your domain in Google Cloud Console before pasting it here.
          </span>
        </label>
        <input
          type="text"
          className={styles.input}
          value={google.mapsApiKey}
          onChange={(e) => update({ google: { mapsApiKey: e.target.value } })}
          placeholder="AIzaSy..."
          spellCheck={false}
          autoComplete="off"
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>Panorama search radius (m)</span>
          <span className={styles.labelHint}>
            When the user drops the Street View pegman, the service searches this far
            from the drop point for the nearest panorama. Larger values reach more
            imagery; smaller values give a more precise drop.
          </span>
        </label>
        <input
          type="number"
          min={5}
          max={500}
          step={5}
          className={styles.input}
          value={google.panoramaRadiusM}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (Number.isFinite(n) && n > 0) {
              update({ google: { panoramaRadiusM: n } })
            }
          }}
        />
      </div>

      <p className={styles.panelFootnote}>
        Street View usage counts against your Google Maps Platform quota and bill.
        Each panorama load is a billable request. Restrict your key by HTTP referrer
        to avoid leaks.
      </p>
    </div>
  )
}
