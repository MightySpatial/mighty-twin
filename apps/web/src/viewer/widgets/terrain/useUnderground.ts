/** Underground floor — T+1230.
 *
 *  V2 port of the V1 Underground panel. Three controls combine into
 *  one "Underground mode":
 *
 *    - Globe translucency  (so the terrain stops occluding)
 *    - Floor entity        (translucent rectangle at a chosen depth
 *                           that anchors the user visually)
 *    - X-ray-terrain flag  (depthTestAgainstTerrain, controls whether
 *                           subsurface 3D-Tiles render through the
 *                           globe surface)
 *
 *  The hook owns the cesium-side state so the panel UI stays purely
 *  declarative. ``masterEnable`` is the one knob that controls all
 *  three at once: turning it on uses sensible defaults, turning it
 *  off restores the globe to opaque surface mode.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Color,
  type Entity,
  Rectangle,
  type Viewer,
} from 'cesium'

const DEFAULT_FLOOR_DEPTH = -150
const DEFAULT_FLOOR_OPACITY = 0.92
const DEFAULT_TRANSPARENCY = 0.5
const DEFAULT_FLOOR_COLOUR = '#0a0a14'

export interface UndergroundState {
  enabled: boolean
  floorEnabled: boolean
  floorDepth: number   // metres, negative = below surface
  floorOpacity: number // 0..1
  xrayTerrain: boolean // disables depthTestAgainstTerrain
}

const INITIAL: UndergroundState = {
  enabled: false,
  floorEnabled: false,
  floorDepth: DEFAULT_FLOOR_DEPTH,
  floorOpacity: DEFAULT_FLOOR_OPACITY,
  xrayTerrain: false,
}

interface UseUndergroundReturn {
  state: UndergroundState
  set: (patch: Partial<UndergroundState>) => void
  enable: () => void
  disable: () => void
  reset: () => void
}

export function useUnderground(
  viewerRef: React.MutableRefObject<Viewer | null>,
  globeAlpha: number,
  setGlobeAlpha: (a: number) => void,
): UseUndergroundReturn {
  const [state, setState] = useState<UndergroundState>(INITIAL)
  const floorRef = useRef<Entity | null>(null)
  // Remember the user's globe alpha + depth-test before underground
  // mode took over, so we can restore it on disable.
  const restoreRef = useRef<{ alpha: number; depthTest: boolean } | null>(null)

  // ── Apply state to Cesium ───────────────────────────────────────
  const applyFloor = useCallback(
    (s: UndergroundState) => {
      const viewer = viewerRef.current
      if (!viewer) return
      try {
        if (s.enabled && s.floorEnabled) {
          if (!floorRef.current) {
            floorRef.current = viewer.entities.add({
              name: '__underground_floor__',
              rectangle: {
                coordinates: new Rectangle(-Math.PI, -Math.PI / 2, Math.PI, Math.PI / 2),
                height: s.floorDepth,
                material: Color.fromCssColorString(DEFAULT_FLOOR_COLOUR).withAlpha(
                  s.floorOpacity,
                ),
                outline: false,
              },
            })
          } else {
            const r = floorRef.current.rectangle
            if (r) {
              r.height = s.floorDepth as never
              r.material = Color.fromCssColorString(DEFAULT_FLOOR_COLOUR).withAlpha(
                s.floorOpacity,
              ) as never
            }
          }
        } else if (floorRef.current) {
          viewer.entities.remove(floorRef.current)
          floorRef.current = null
        }
      } catch {
        /* viewer destroyed */
      }
    },
    [viewerRef],
  )

  const applyXray = useCallback(
    (xray: boolean) => {
      const viewer = viewerRef.current
      if (!viewer) return
      try {
        viewer.scene.globe.depthTestAgainstTerrain = !xray
      } catch {
        /* viewer destroyed */
      }
    },
    [viewerRef],
  )

  // ── Public setters ──────────────────────────────────────────────
  const set = useCallback(
    (patch: Partial<UndergroundState>) => {
      setState((prev) => {
        const next = { ...prev, ...patch }
        applyFloor(next)
        if (patch.xrayTerrain !== undefined) applyXray(next.xrayTerrain)
        return next
      })
    },
    [applyFloor, applyXray],
  )

  const enable = useCallback(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    // Capture pre-underground globe state for restore
    restoreRef.current = {
      alpha: globeAlpha,
      depthTest: viewer.scene.globe.depthTestAgainstTerrain,
    }
    if (globeAlpha === 1) setGlobeAlpha(DEFAULT_TRANSPARENCY)
    applyXray(true)
    setState((prev) => {
      const next: UndergroundState = {
        ...prev,
        enabled: true,
        floorEnabled: true,
        xrayTerrain: true,
      }
      applyFloor(next)
      return next
    })
  }, [viewerRef, globeAlpha, setGlobeAlpha, applyFloor, applyXray])

  const disable = useCallback(() => {
    const restore = restoreRef.current
    if (restore) {
      setGlobeAlpha(restore.alpha)
      applyXray(!restore.depthTest)
      restoreRef.current = null
    } else {
      setGlobeAlpha(1)
      applyXray(false)
    }
    setState((prev) => {
      const next: UndergroundState = {
        ...prev,
        enabled: false,
        floorEnabled: false,
        xrayTerrain: false,
      }
      applyFloor(next)
      return next
    })
  }, [setGlobeAlpha, applyFloor, applyXray])

  const reset = useCallback(() => {
    setState(INITIAL)
    applyFloor(INITIAL)
    applyXray(false)
    setGlobeAlpha(1)
    restoreRef.current = null
  }, [applyFloor, applyXray, setGlobeAlpha])

  // ── Cleanup on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      const viewer = viewerRef.current
      if (!viewer) return
      try {
        if (floorRef.current) {
          viewer.entities.remove(floorRef.current)
          floorRef.current = null
        }
        // Don't restore depth-test here — the user might want
        // the setting to persist after the panel closes. Restore is
        // explicit via disable() / reset().
      } catch {
        /* viewer destroyed */
      }
    }
  }, [viewerRef])

  return { state, set, enable, disable, reset }
}
