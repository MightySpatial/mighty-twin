/** Fly-through camera mode (formerly "walk").
 *
 *  Cesium ships orbit / pan / tilt / zoom as the default camera
 *  controllers. Useful for an aerial overview, terrible for "fly me
 *  through this scene at a specific pace". This hook adds a first-
 *  person WASD locomotion mode with five speed presets — from cycling
 *  pace all the way up to fighter-jet — and arrow-key pitch/yaw on
 *  top of mouse-drag look.
 *
 *  Activation contract:
 *    - The caller calls ``setActive(true)`` to enter and
 *      ``setActive(false)`` to exit. The hook owns the ``onTick``
 *      listener, the keyboard listeners, and toggles the
 *      ``screenSpaceCameraController`` flags so orbit/zoom/tilt don't
 *      fight the locomotion.
 *    - Keys:
 *        W/S       — forward/back along camera heading
 *        A/D       — strafe left/right
 *        Q/E       — vertical up/down (real-world altitude)
 *        Space     — vertical up (alias for Q on qwerty laptops)
 *        Shift     — temporarily 2× the active speed (sprint hold)
 *        Esc       — exit fly mode (host clears active state)
 *        ↑ / ↓     — pitch camera up / down (look up / look down)
 *        ← / →     — yaw left / right (turn in place)
 *        + / =     — shift up one gear  (caller handles via onGearShift)
 *        -         — shift down one gear (caller handles via onGearShift)
 *    - Mouse drag → look (the screenSpaceCameraController flag
 *      ``enableLook`` is on; pan/rotate/zoom are off so the only
 *      mouse-driven motion is camera rotation in place).
 *
 *  The motion is computed every tick in **metres**, using the current
 *  camera's east/north/up basis. Cesium's ``camera.move*`` helpers take
 *  metres directly, so this matches real-world speed regardless of
 *  altitude or scene scale.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Cartesian3,
  Math as CesiumMath,
  JulianDate,
  type Viewer as CesiumViewerType,
} from 'cesium'

// ── 5-speed gear system (sequential shifter) ────────────────────────────
//
// Speeds range from a cyclist's pace all the way to fighter-jet so the
// same widget handles a 1:1 splat walk-through, a city overview at
// driving speed, and a continental flyover in jet mode. The engine
// only consumes ``mps``; the widget owns icon + label presentation.

export interface FlySpeedDef {
  id: FlySpeedId
  label: string
  /** Metres per second. Multiplied by Shift→2× when sprinting. */
  mps: number
}

export type FlySpeedId =
  | 'walk' | 'cycling' | 'driving' | 'gliding' | 'jet' | 'fighterJet'

export const FLY_SPEEDS: readonly FlySpeedDef[] = [
  { id: 'walk',       label: 'Walk',        mps: 1.4  },  // 5 km/h
  { id: 'cycling',    label: 'Cycling',     mps: 4.2  },  // 15 km/h
  { id: 'driving',    label: 'Driving',     mps: 16.7 },  // 60 km/h
  { id: 'gliding',    label: 'Gliding',     mps: 41.7 },  // 150 km/h
  { id: 'jet',        label: 'Jet',         mps: 250  },  // 900 km/h
  { id: 'fighterJet', label: 'Fighter Jet', mps: 556  },  // 2000 km/h
] as const

export type FlySpeed = FlySpeedId

export function flySpeedLabel(s: FlySpeed): string {
  return FLY_SPEEDS.find(g => g.id === s)?.label ?? s
}
export function flySpeedMps(s: FlySpeed): number {
  return FLY_SPEEDS.find(g => g.id === s)?.mps ?? FLY_SPEEDS[0].mps
}
export function flySpeedIndex(s: FlySpeed): number {
  return Math.max(0, FLY_SPEEDS.findIndex(g => g.id === s))
}
/** Sequential shifter — clamp at both ends. */
export function shiftGear(s: FlySpeed, delta: 1 | -1): FlySpeed {
  const i = flySpeedIndex(s)
  const next = Math.max(0, Math.min(FLY_SPEEDS.length - 1, i + delta))
  return FLY_SPEEDS[next].id
}

// ── Arrow-key turn rates ─────────────────────────────────────────────────
//
// Pitch/yaw with the arrow keys. The base rate is 45°/sec; the host
// can override via ``turnDegPerSec``. Pitch is clamped to ±89° to
// prevent the camera flipping at the poles. Yaw wraps cleanly.

const DEFAULT_TURN_DEG_PER_SEC = 45
const PITCH_LIMIT_RAD = CesiumMath.toRadians(89)

interface UseFlyModeArgs {
  viewerRef: React.RefObject<CesiumViewerType | null>
  active: boolean
  speed: FlySpeed
  /** Optional clamp on minimum height-above-terrain. Stops the camera
   *  from clipping below the ground in 1:1 splat / building scenes. */
  minHeightAboveGround?: number
  /** Arrow-key pitch/yaw rate in degrees per second. */
  turnDegPerSec?: number
  /** Called when the user presses `+`/`=` (delta=+1) or `-` (delta=-1).
   *  The host owns gear state — this hook is read-only on it. */
  onGearShift?: (delta: 1 | -1) => void
}

interface UseFlyModeApi {
  /** True when one or more locomotion keys are pressed — the host can
   *  show a "moving" indicator without polling. */
  isMoving: boolean
}

export function useFlyMode({
  viewerRef,
  active,
  speed,
  minHeightAboveGround = 0.5,
  turnDegPerSec = DEFAULT_TURN_DEG_PER_SEC,
  onGearShift,
}: UseFlyModeArgs): UseFlyModeApi {
  // We track keys in a ref so the per-tick handler can read them
  // without re-subscribing on every keystroke.
  const keysRef = useRef<{ [key: string]: boolean }>({})
  const isMovingRef = useRef(false)
  const lastTickRef = useRef<JulianDate | null>(null)

  // Capture the previous controller state so we can restore it on exit
  // — the caller might have orbit-disabled for some other reason.
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

  const turnRateRef = useRef(turnDegPerSec)
  turnRateRef.current = turnDegPerSec

  const onGearShiftRef = useRef(onGearShift)
  onGearShiftRef.current = onGearShift

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

    // Keys we want to swallow from default browser behaviour (Space
    // scrolls, arrows scroll, + zooms in some browser shells).
    const SWALLOW = new Set([
      'w', 'a', 's', 'd', 'q', 'e', ' ',
      'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
      '+', '=', '-', '_',
    ])

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
      const k = e.key.toLowerCase()
      keysRef.current[k] = true

      // Gear-shift shortcuts fire once per press, not every tick — the
      // host owns the gear state machine.
      if (!e.repeat) {
        if (k === '+' || k === '=') onGearShiftRef.current?.(1)
        else if (k === '-' || k === '_') onGearShiftRef.current?.(-1)
      }

      if (SWALLOW.has(k)) e.preventDefault()
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

      // ── Translation (WASD + QE + Space) ────────────────────────────
      const fwd = (k['w'] ? 1 : 0) - (k['s'] ? 1 : 0)
      const right = (k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)
      const up = (k['e'] ? 1 : 0) + (k[' '] ? 1 : 0) - (k['q'] ? 1 : 0)

      // ── Rotation (arrow keys) ──────────────────────────────────────
      //
      // Up/Down → pitch; Left/Right → yaw (heading). Cesium's
      // ``setView`` is the cleanest path — read the current orientation,
      // add the delta, write back. ``camera.lookUp/Down`` / ``twistLeft``
      // exist but mutate roll too, which we don't want.
      const yawSign = (k['arrowleft'] ? 1 : 0) - (k['arrowright'] ? 1 : 0)
      const pitchSign = (k['arrowup'] ? 1 : 0) - (k['arrowdown'] ? 1 : 0)

      isMovingRef.current = fwd !== 0 || right !== 0 || up !== 0
        || yawSign !== 0 || pitchSign !== 0

      const cam = v.camera

      if (yawSign !== 0 || pitchSign !== 0) {
        const rate = CesiumMath.toRadians(turnRateRef.current) * dt
        // Heading wraps; pitch clamps to ±89° to avoid gimbal flip at
        // the poles.
        const heading = cam.heading + yawSign * rate
        const rawPitch = cam.pitch + pitchSign * rate
        const pitch = Math.max(-PITCH_LIMIT_RAD, Math.min(PITCH_LIMIT_RAD, rawPitch))
        cam.setView({
          destination: cam.position,
          orientation: { heading, pitch, roll: cam.roll },
        })
      }

      if (fwd === 0 && right === 0 && up === 0) {
        return
      }
      const baseMps = flySpeedMps(speedRef.current)
      const mps = k['shift'] ? baseMps * 2 : baseMps
      const step = mps * dt

      // Cesium's ``moveForward`` / ``moveRight`` / ``moveUp`` work in
      // the camera's local frame in metres — exactly what we want for
      // a ground-relative pace.
      if (fwd !== 0) cam.moveForward(step * fwd)
      if (right !== 0) cam.moveRight(step * right)
      if (up !== 0) cam.moveUp(step * up)

      // Clamp minimum height above terrain (cheap ellipsoid-based
      // approximation; good enough for splat scenes with a known anchor
      // datum). Switching to ``sampleTerrainMostDetailed`` is too
      // expensive for every tick.
      const minH = minHeightRef.current
      if (minH > 0) {
        const c = cam.positionCartographic
        if (c.height < minH) {
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

  // Stable API — `isMoving` is a getter so polls return live state.
  return useMemo<UseFlyModeApi>(() => ({
    get isMoving() {
      return isMovingRef.current
    },
  }), [])
}

/** Convenience: drop the camera at a fly-to anchor at human eye height
 *  and aim it at the scene. Used by "Fly this site" actions to set up
 *  the camera before useFlyMode kicks in. */
export function flyToFlyPose(
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

/** Hook used by callers that need a stable gear-shift callback even when
 *  the host re-renders. Convenience over ``shiftGear``. */
export function useGearShift(setSpeed: (s: FlySpeed) => void, current: FlySpeed) {
  const currentRef = useRef(current)
  currentRef.current = current
  return useCallback((delta: 1 | -1) => {
    const next = shiftGear(currentRef.current, delta)
    if (next !== currentRef.current) setSpeed(next)
  }, [setSpeed])
}
