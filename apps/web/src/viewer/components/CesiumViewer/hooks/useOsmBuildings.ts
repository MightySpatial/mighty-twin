/**
 * useOsmBuildings — mount Cesium's OSM 3D buildings tileset on the
 * globe, with a per-site on/off flag driven by ``site.buildings_enabled``.
 *
 * The tileset is created lazily on first activation (`enabled === true`)
 * and stored in a ref so subsequent toggles flip ``.show`` rather than
 * tearing down the whole 3D-tile cache. Slight transparency
 * (color("white", 0.9)) is applied so the buildings sit comfortably on
 * top of the dark UI without obscuring overlay widgets.
 *
 * Requires the Cesium ion default access token to be set — that
 * happens upstream in ``useTokenFetch`` (env / system-config / user
 * token, in priority order).
 */
import { useEffect, useRef } from 'react'
import {
  Viewer as CesiumViewerType,
  Cesium3DTileset,
  Cesium3DTileStyle,
  createOsmBuildingsAsync,
} from 'cesium'

export function useOsmBuildings(
  viewerRef: React.RefObject<CesiumViewerType | null>,
  enabled: boolean | undefined,
): void {
  const tilesetRef = useRef<Cesium3DTileset | null>(null)
  // Tracks whether a load is in flight so a rapid toggle on→off→on
  // doesn't kick off a second download. The flag is cleared in finally.
  const loadingRef = useRef(false)

  useEffect(() => {
    const viewer = viewerRef.current
    // ``enabled === undefined`` happens during the brief window between
    // viewer mount and site fetch settle — treat as "wait", don't decide.
    if (!viewer || enabled === undefined) return

    let cancelled = false

    if (enabled) {
      const existing = tilesetRef.current
      if (existing) {
        existing.show = true
        return
      }
      if (loadingRef.current) return
      loadingRef.current = true
      ;(async () => {
        try {
          const tileset = await createOsmBuildingsAsync({
            style: new Cesium3DTileStyle({
              color: 'color("white", 0.9)',
            }),
          })
          if (cancelled || !viewerRef.current) {
            // Effect was torn down (or viewer destroyed) before the
            // tileset finished loading — discard it so we don't leak.
            return
          }
          viewerRef.current.scene.primitives.add(tileset)
          tilesetRef.current = tileset
        } catch (err) {
          // Likely an invalid / missing Cesium ion token. Swallow loud
          // failures so the rest of the viewer keeps working; surface
          // through console for the operator.
          // eslint-disable-next-line no-console
          console.warn('[useOsmBuildings] failed to load OSM buildings:', err)
        } finally {
          loadingRef.current = false
        }
      })()
    } else if (tilesetRef.current) {
      tilesetRef.current.show = false
    }

    return () => {
      cancelled = true
    }
  }, [viewerRef, enabled])

  // Tear down the tileset when the viewer itself unmounts. The cleanup
  // above only handles the in-flight async case; this one handles the
  // long-lived primitive.
  useEffect(() => {
    return () => {
      const viewer = viewerRef.current
      const tileset = tilesetRef.current
      if (viewer && tileset) {
        try {
          viewer.scene.primitives.remove(tileset)
        } catch {
          // viewer already destroyed — primitive cleanup happens
          // automatically when Cesium tears down the scene.
        }
      }
      tilesetRef.current = null
    }
  }, [viewerRef])
}
