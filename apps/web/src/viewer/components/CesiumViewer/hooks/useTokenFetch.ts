import { useEffect, useState } from 'react'
import { Ion } from 'cesium'
import { usePersistedSettings } from '@mightyspatial/settings-panels'
import { authFetch } from '../../../utils/authFetch'
import { useToast } from '../../../hooks/useToast'
import type { SystemConfig } from '../../../types/api'

/** Three-tier Cesium Ion token resolution.
 *
 *  Priority (first non-empty wins):
 *    1. User-set token in Settings → Basemap (per-browser, localStorage)
 *    2. Server config `/api/system/config.cesium_ion_token` (per-tenant, DB)
 *    3. VITE_CESIUM_ACCESS_TOKEN (build-time env var, baseline)
 *
 *  The browser-scoped setting overrides because it's the knob users
 *  reach for — typing a token into Settings should always take effect.
 *  The server config stays because that's how MightyTwin v1 distributes
 *  tokens to tenants. The env var is the dev fallback so local dev
 *  doesn't need either of the above to work. */
export function useTokenFetch() {
  const [tokenReady, setTokenReady] = useState(false)
  const { addToast } = useToast()
  const { settings } = usePersistedSettings()
  const userToken = settings.basemap.ionToken.trim()

  useEffect(() => {
    const envToken = import.meta.env.VITE_CESIUM_ACCESS_TOKEN as string | undefined

    // Tier 1: user setting (highest priority)
    if (userToken) {
      Ion.defaultAccessToken = userToken
      setTokenReady(true)
      return
    }

    // Tier 3: env baseline applied up-front so tile requests during the
    // network round-trip to /api/system/config still authenticate.
    if (envToken) Ion.defaultAccessToken = envToken

    // Tier 2: server config overrides env if present
    authFetch('/api/system/config')
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch system config')
        return r.json() as Promise<SystemConfig>
      })
      .then(cfg => {
        if (cfg.cesium_ion_token) {
          Ion.defaultAccessToken = cfg.cesium_ion_token
        } else if (!Ion.defaultAccessToken) {
          addToast('warning', 'Cesium Ion token not configured — 3D terrain and imagery may not load')
        }
      })
      .catch(() => {
        if (!Ion.defaultAccessToken) {
          addToast('warning', 'Could not load Cesium Ion token — 3D terrain and imagery may not load')
        }
      })
      .finally(() => setTokenReady(true))
  }, [addToast, userToken])

  return tokenReady
}
