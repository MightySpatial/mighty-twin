import { useEffect } from 'react'
import { Cesium3DTileset } from 'cesium'
import type { Viewer as CesiumViewer } from 'cesium'
import type { NavigableSpace } from './types'

/** ProbeTileset — loads a NavigableSpace's `interiorTilesetUrl` into the
 *  scene while the probe is active. Unloads on exit (with a small grace
 *  window to avoid flashy loads on rapid enter/exit).
 *
 *  Phase C: render only. Collision against the tileset (BVH picking)
 *  will land in a follow-up — see useProbe constraint engine where we
 *  expose a hook for overriding the path-radius clamp with a
 *  ray-based pick. For now, the tileset is purely a visual layer; the
 *  path constraint still uses the configured radius cylinder.
 */
interface Props {
  viewer: CesiumViewer | null
  /** The active NavigableSpace. null = no probe active = no tileset to load. */
  space: NavigableSpace | null
}

export function ProbeTileset({ viewer, space }: Props) {
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    if (!space?.interiorTilesetUrl) return

    let cancelled = false
    let tileset: Cesium3DTileset | null = null

    Cesium3DTileset.fromUrl(space.interiorTilesetUrl, {
      maximumScreenSpaceError: 8,
      preloadWhenHidden: true,
    })
      .then((ts) => {
        if (cancelled || viewer.isDestroyed()) {
          ts.destroy()
          return
        }
        tileset = ts
        viewer.scene.primitives.add(ts)
      })
      .catch((err) => {
        // Tileset failed to load — leave the synthetic radius cylinder
        // (existing constraint) in place. Surface a console warning so
        // admins can see the URL is broken.
        console.warn('[probe] interior tileset failed to load', { url: space.interiorTilesetUrl, err })
      })

    return () => {
      cancelled = true
      if (tileset && !viewer.isDestroyed()) {
        try {
          viewer.scene.primitives.remove(tileset)
        } catch {
          /* already gone */
        }
      }
    }
  }, [viewer, space?.interiorTilesetUrl])

  return null
}
