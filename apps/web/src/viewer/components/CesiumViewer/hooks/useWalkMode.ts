/** Walking / running fly-through camera mode.
 *
 *  Cesium ships orbit / pan / tilt / zoom as the default camera
 *  controllers. Useful for an aerial overview, terrible for "walk me
 *  through this scene at human pace". This hook adds a first-person
 *  WASD locomotion mode with three speed presets:
 *
 *    walk    1.4 m/s  (Mehrabian "comfortable" walking pace)
 *    run     3.5 m/s  (light jog)
 *    sprint  7.0 m/s  (a fast cyclist)
 *
 *  Activation contract:
 *    - The caller calls ``setActive(true)`` to enter and ``setActive(false)``
 *      to exit. The hook owns the ``onTick`` listener, the keyboard
 *      listeners, and toggles the screenSpaceCameraController flags so
 *      orbit/zoom/tilt don't fight the locomotion.
 *    - Keys: W/S — forward/back along camera heading
 *            A/D — strafe left/right
 *            Q/E — vertical up/down (real-world altitude)
 *            Shift — temporarily 2× the active speed (sprint hold)
 *            Space — vertical up (alias for Q on querty laptops)
 *            Escape — exit walk mode (host clears active state)
 *    - Mouse drag → look (the screenSpaceCameraController flag
 *      ``enableLook`` is on; pan/rotate/zoom are off so the only
 *      mouse-driven motion is camera rotation in place).
 *
 *  The motion is computed every tick in **metres**, using the current
 *  camera's east/north/up basis. Cesium's ``camera.move*`` helpers take
 *  metres directly, so this matches real-world speed regardless of
 *  altitude or scene scale — what the camera "sees" stays consistent
 *  whether you're walking through a 1:1 splat or a continent-scale
 *  terrain layer.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Cartesian3,
  JulianDate,
  type Viewer as CesiumViewerType,
} from 'cesium'

export type WalkSpeed = 'walk' | 'run' | 'sprint'

const SPEED_MPS: Record<WalkSpeed, number> = {
  walk: 1.4,
  run: 3.5,
  sprint: 7.0,
}

interface UseWalkModeArgs {
  viewerRef: React.RefObject<CesiumViewerType | null>
  active: boolean
  speed: WalkSpeed
  /** Optional clamp on minimum height-above-terrain. Stops the camera
   *  from clipping below the ground in 1:1 splat / building scenes. */
  minHeightAboveGround?: number
}

interface UseWalkModeApi {
  /** True when one or more locomotion keys are pressed — the host can
   *  show a "moving" indicator without polling. */
  isMoving: boolean
}

export function useWalkMode({
  viewerRef,
  active,
  speed,
  minHeightAboveGround = 0.5,
}: UseWalkModeArgs): UseWalkModeApi {
  // We track keys in a ref so the per-tick handler can read them
  // without re-subscribing on every keystroke. ``React.useState`` would
  // re-render the host every keypress which is overkill.
  const keysRef = useRef<{ [key: string]: boolean }>({})
  const isMovingRef = useRef(false)
  const lastTickRef = useRef<JulianDate | null>(null)

  // Capture the previous controller state so we can restore it on exit
  // — the caller might have orbit-disabled for some other reason and
  // we shouldn't trample that.
  const savedRef = useRef<{
    enableRotate: boolean
    enableTilt: boolean
    enableTranslate: boolean
    enableZoom: boolean
    enableLook: boolean
  } | null>(null)

  const speedRef = useRef(speed)
  speedRef.current = speed

  const minHeightRef = useRef(minHeightAboveGround)
  minHeightRef.current = minHeightAboveGround

  // Wire/unwire keyboard + tick listeners on activation.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const ctrl = viewer.scene.screenSpaceCameraController

    if (!active) {
      // Restore on exit. No-op if we never activated.
      if (savedRef.current) {
        ctrl.enableRotate = savedRef.current.enableRotate
        ctrl.enableTilt = savedRef.current.enableTilt
        ctrl.enableTranslate = savedRef.current.enableTranslate
        ctrl.enableZoom = savedRef.current.enableZoom
        ctrl.enableLook = savedRef.current.enableLook
        savedRef.current = null
      }
      keysRef.current = {}
      isMovingRef.current = false
      return
    }

    // Snapshot, then clamp the controller into "look only" mode.
    savedRef.current = {
      enableRotate: ctrl.enableRotate,
      enableTilt: ctrl.enableTilt,
      enableTranslate: ctrl.enableTranslate,
      enableZoom: ctrl.enableZoom,
      enableLook: ctrl.enableLook,
    }
    ctrl.enableRotate = false
    ctrl.enableTilt = false
    ctrl.enableTranslate = false
    ctrl.enableZoom = false
    ctrl.enableLook = true

    function onKeyDown(e: KeyboardEvent) {
      // Don't capture keys while typing in inputs.
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.isContentEditable)
      ) {
        return
      }
      keysRef.current[e.key.toLowerCase()] = true
      // Some keys feel better with default disabled (Space scrolls).
      if (['w', 'a', 's', 'd', 'q', 'e', ' '].includes(e.key.toLowerCase())) {
        e.preventDefault()
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      keysRef.current[e.key.toLowerCase()] = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    // Per-tick locomotion. clock.onTick fires before render so motion
    // applied here is reflected in the same frame.
    function onTick() {
      const v = viewerRef.current
      if (!v) return
      const now = JulianDate.now()
      const last = lastTickRef.current ?? now
      const dt = JulianDate.secondsDifference(now, last)
      lastTickRef.current = now
      if (dt <= 0 || dt > 0.5) return // first tick or pause — skip

      const k = keysRef.current
      const fwd = (k['w'] ? 1 : 0) - (k['s'] ? 1 : 0)
      const right = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)
      const up = (k['e'] ? 1 : 0) + (k[' '] ? 1 : 0) - (k['q'] ? 1 : 0)
      isMovingRef.current = fwd !== 0 || right !== 0 || up !== 0

      if (!isMovingRef.current) return
      const baseMps = SPEED_MPS[speedRef.current]
      const mps = k['shift'] ? baseMps * 2 : baseMps
      const step = mps * dt

      // Cesium's ``moveForward`` / ``moveRight`` / ``moveUp`` work in
      // the camera's local frame in metres — exactly what we want for a
      // ground-relative walking pace.
      const cam = v.camera
      if (fwd !== 0) cam.moveForward(step * fwd)
      if (right !== 0) cam.moveRight(step * right)
      if (up !== 0) cam.moveUp(step * up)

      // Clamp minimum height above terrain. We approximate by sampling
      // the terrain height at the camera's current cartographic; if the
      // camera dipped below the floor, lift it.
      const minH = minHeightRef.current
      if (minH > 0) {
        const c = cam.positionCartographic
        const ellipsoidH = c.height
        // Note: this clamps absolute ellipsoid height, which is good
        // enough for splat scenes where the anchor sets a known datum.
        // For terrain-clamped scenes use sampleTerrainMostDetailed in a
        // follow-up — too expensive to call every tick.
        if (ellipsoidH < minH) {
          cam.position = Cartesian3.fromRadians(c.longitude, c.latitude, minH)
        }
      }
    }
    const removeTick = viewer.clock.onTick.addEventListener(onTick)

    return () => {
      removeTick()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [active, viewerRef])

  return useMemo<UseWalkModeApi>(() => ({
    get isMoving() {
      return isMovingRef.current
    },
  }), [])
}

/** Convenience: drop the camera at a fly-to anchor at human eye height
 *  and aim it at the scene. Used by "Walk this site" actions to set up
 *  the camera before useWalkMode kicks in. */
export function flyToWalkPose(
  viewer: CesiumViewerType,
  anchor: { lon: number; lat: number; height?: number },
  opts: {
    /** Eye height in metres above the anchor. 1.7 = average adult. */
    eyeHeight?: number
    /** Look heading in degrees (0 = north). */
    headingDeg?: number
    /** Animation duration. */
    duration?: number
  } = {},
): Promise<void> {
  const eye = opts.eyeHeight ?? 1.7
  const heading = ((opts.headingDeg ?? 0) * Math.PI) / 180
  return new Promise((resolve) => {
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(
        anchor.lon,
        anchor.lat,
        (anchor.height ?? 0) + eye,
      ),
      orientation: { heading, pitch: 0, roll: 0 },
      duration: opts.duration ?? 1.4,
      complete: () => resolve(),
    })
  })
}

export const WALK_SPEEDS: WalkSpeed[] = ['walk', 'run', 'sprint']
export function walkSpeedLabel(s: WalkSpeed): string {
  // Short label for compact UI — full "Walk · 1.4 m/s" version is
  // composed in the WalkWidget when there's room.
  return s === 'walk' ? 'Walk' : s === 'run' ? 'Run' : 'Sprint'
}
export function walkSpeedMps(s: WalkSpeed): number {
  return SPEED_MPS[s]
}
