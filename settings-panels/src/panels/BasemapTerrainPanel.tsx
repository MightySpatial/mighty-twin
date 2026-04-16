import { usePersistedSettings } from '../hooks/usePersistedSettings'
import type { BasemapProvider } from '../types'
import styles from '../SettingsShell.module.css'

export function BasemapTerrainPanel() {
  const { settings, update } = usePersistedSettings()
  const { basemap } = settings

  return (
    <div className={styles.panel}>
      <h2>Basemap & terrain</h2>
      <p className={styles.panelDesc}>
        Choose the imagery provider and terrain for the globe. Ion providers
        require a free Cesium Ion access token (sign up at
        <a href="https://ion.cesium.com/signup/"> ion.cesium.com</a>).
      </p>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>
            Provider
            <span className={styles.reloadBadge}>Reload</span>
          </span>
          <span className={styles.labelHint}>OSM works without a token.</span>
        </label>
        <select
          className={styles.select}
          value={basemap.provider}
          onChange={(e) =>
            update({ basemap: { provider: e.target.value as BasemapProvider } })
          }
        >
          <option value="osm">OpenStreetMap (no token)</option>
          <option value="ion-bing">Cesium Ion · Bing Aerial</option>
          <option value="ion-sentinel">Cesium Ion · Sentinel-2</option>
        </select>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>
            Ion token
            <span className={styles.reloadBadge}>Reload</span>
          </span>
          <span className={styles.labelHint}>Stored in localStorage only.</span>
        </label>
        <input
          type="password"
          className={styles.input}
          placeholder="Paste Ion token"
          value={basemap.ionToken}
          onChange={(e) => update({ basemap: { ionToken: e.target.value } })}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          <span className={styles.labelName}>
            Cesium World Terrain
            <span className={styles.reloadBadge}>Reload</span>
          </span>
          <span className={styles.labelHint}>3D terrain. Requires Ion token.</span>
        </label>
        <button
          type="button"
          aria-pressed={basemap.terrainEnabled}
          className={`${styles.toggle} ${basemap.terrainEnabled ? styles.toggleOn : ''}`}
          onClick={() => update({ basemap: { terrainEnabled: !basemap.terrainEnabled } })}
        />
      </div>
    </div>
  )
}
