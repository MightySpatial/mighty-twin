/** Lazy-load the Google Maps JavaScript API.
 *
 *  We avoid bundling the @googlemaps/js-api-loader because it's another
 *  Promise-chained dependency for what is essentially one <script> tag.
 *  Instead, we inject the script when the user actually activates a feature
 *  that needs Google (Street View), and reuse it forever after.
 *
 *  The loader is global-state-shaped because google.maps is a global. We can't
 *  load two copies; the singleton promise pattern is the standard.
 */

declare global {
  interface Window {
    google?: { maps?: unknown }
    __mightyGoogleLoader?: Promise<typeof google.maps>
  }
}

const MAPS_API_BASE = 'https://maps.googleapis.com/maps/api/js'

export interface GoogleLoaderError extends Error {
  reason: 'no-key' | 'auth-failure' | 'load-failed' | 'timeout'
}

function err(reason: GoogleLoaderError['reason'], message: string): GoogleLoaderError {
  const e = new Error(message) as GoogleLoaderError
  e.reason = reason
  return e
}

/** Load Google Maps with the user's API key. Resolves with the
 *  `google.maps` namespace ready to use. */
export function loadGoogleMaps(apiKey: string): Promise<typeof google.maps> {
  if (!apiKey || apiKey.trim().length === 0) {
    return Promise.reject(err('no-key', 'Google Maps API key is not set'))
  }
  if (window.google?.maps) {
    return Promise.resolve(window.google.maps as typeof google.maps)
  }
  if (window.__mightyGoogleLoader) {
    return window.__mightyGoogleLoader
  }

  window.__mightyGoogleLoader = new Promise<typeof google.maps>((resolve, reject) => {
    // Auth failure callback — Google calls this on the global window if the
    // API key is invalid / blocked / quota-exceeded.
    ;(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
      reject(err('auth-failure', 'Google Maps authentication failed — check the API key and referrer restrictions'))
    }

    const script = document.createElement('script')
    script.async = true
    script.defer = true
    script.src = `${MAPS_API_BASE}?key=${encodeURIComponent(apiKey)}&libraries=streetview&callback=__mightyGoogleReady&v=weekly`

    const timeout = window.setTimeout(() => {
      reject(err('timeout', 'Google Maps script took too long to load'))
    }, 15000)

    ;(window as unknown as { __mightyGoogleReady?: () => void }).__mightyGoogleReady = () => {
      window.clearTimeout(timeout)
      if (window.google?.maps) {
        resolve(window.google.maps as typeof google.maps)
      } else {
        reject(err('load-failed', 'Google Maps loaded but namespace is missing'))
      }
    }

    script.addEventListener('error', () => {
      window.clearTimeout(timeout)
      reject(err('load-failed', 'Failed to fetch the Google Maps script'))
    })

    document.head.appendChild(script)
  })

  return window.__mightyGoogleLoader
}

/** True if Google Maps has been loaded already (no network round trip). */
export function isGoogleMapsLoaded(): boolean {
  return !!window.google?.maps
}
