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
 *        Q/E       — roll left/right (bank like an aircraft). Auto-
 *                    levels back to 0° at 30°/sec when released, like
 *                    a stick returning to centre. Clamped to ±60°.
 *        Space     — climb (vertical up — useful when banked)
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

/** Clamp a number to [-1, 1]. Used to merge keyboard + touch
 *  locomotion intents without overshoot. */
function clampUnit(x: number): number {
  return Math.max(-1, Math.min(1, x))
}
const ROLL_LIMIT_RAD = CesiumMath.toRadians(60)
/** Auto-leveling rate when Q/E aren't held — gentler than the active
 *  bank rate so the camera "drifts" back to wings-level rather than
 *  snapping. ~30°/sec ≈ 2 seconds from full ±60° bank to wings-level. */
const AUTO_LEVEL_DEG_PER_SEC = 30
/** Below this angle we snap roll to exactly 0 — avoids endless tiny
 *  setView calls when the camera is effectively level. */
const ROLL_EPSILON_RAD = CesiumMath.toRadians(0.1)

/** Touch intent — set by useFlyTouchGestures for mobile. Mirrored
 *  into the per-tick locomotion calculation alongside keyboard input
 *  so a tap-and-drag + a pinch can drive the same camera as WASD on
 *  desktop. All fields are -1..1 (or boolean for axes that only have
 *  on/off semantics). */
export interface FlyTouchIntent {
  forward: number   // -1 .. 1 (negative = back)
  right:   number   // -1 .. 1 (negative = strafe left)
  up:      number   // -1 .. 1 (negative = sink — Space-only on keyboard)
  yaw:     number   // -1 .. 1 (negative = right)
  pitch:   number   // -1 .. 1 (negative = down)
}

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
  /** Optional touch-intent ref. When set, its values are mixed into
   *  the per-tick locomotion calculation alongside the keyboard
   *  state. Useful for mobile where useFlyTouchGestures translates
   *  pointer events into intent values. */
  touchIntentRef?: React.MutableRefObject<FlyTouchIntent>
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
  touchIntentRef,
}: UseFlyModeArgs): UseFlyModeApi {
  // We track keys in a ref so the per-tick handler can read them
  // without re-subscribing on every keystroke.
  const keysRef = useRef<{ [key: string]: boolean }>({})
  const isMovingRef = useRef(false)
  const lastTickRef = useRef<JulianDate | null>(null)
  // True once the user has pressed Q or E in the current activation.
  // Gates the auto-level loop so cameras that arrive with residual
  // roll (from flyTo / look-around / float drift) don't get
  // "corrected" on activation — that correction was the source of
  // the apparent spinning bug, since each correction round-tripped
  // heading/pitch/roll through setView's HPR→orientation conversion
  // and compounded float drift into the heading axis.
  const hasRolledRef = useRef(false)

  // Capture the previous controller state so we can restore it on exit
  // — the caller might have orbit-disabled for some other reason.
  const savedRef = useRef<{
    enableRotate: boolean
    enableTilt: boolean
    enableTranslate: boolean
    enableZoom: boolean
    enableLook: boolean
  } | null>(null)

  // Track the clock's animation state before we force it on.
  // In a static scene (no time-dependent data) shouldAnimate is false
  // and clock.onTick never fires — so locomotion silently does nothing.
  // We force it true while fly is active and restore on exit.
  const savedShouldAnimateRef = useRef<boolean | null>(null)

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
      // Restore the clock animation state we saved on activation.
      if (savedShouldAnimateRef.current !== null) {
        viewer.clock.shouldAnimate = savedShouldAnimateRef.current
        savedShouldAnimateRef.current = null
      }
      keysRef.current = {}
      isMovingRef.current = false
      hasRolledRef.current = false
      lastTickRef.current = null
      return
    }

    // Fresh activation — clear any stale roll-intent flag and force
    // the first tick to skip (lastTickRef = null → dt = 0 path).
    hasRolledRef.current = false
    lastTickRef.current = null

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

      // Record roll intent on first press so the auto-level loop can
      // distinguish "user banked the camera" from "camera arrived
      // with non-zero roll for unrelated reasons".
      if (k === 'q' || k === 'e') hasRolledRef.current = true

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
      const ti = touchIntentRef?.current

      // ── Translation (WASD + Space, plus touch intent) ──────────────
      // Q/E are reserved for roll. Space stays as the climb key; for
      // descent the pilot pitches down and adds throttle. Touch intent
      // is *added* (and clamped to ±1) so a finger drag composes with
      // any held keys — on mobile keys are effectively zero so this
      // degenerates to "touch only".
      const fwd = clampUnit(((k['w'] ? 1 : 0) - (k['s'] ? 1 : 0)) + (ti?.forward ?? 0))
      const right = clampUnit(((k['d'] ? 1 : 0) - (k['a'] ? 1 : 0)) + (ti?.right ?? 0))
      const up = clampUnit((k[' '] ? 1 : 0) + (ti?.up ?? 0))

      // ── Rotation (arrow keys + Q/E + touch intent) ─────────────────
      //
      // ↑/↓ → pitch; ←/→ → yaw; Q/E → roll. Yaw/pitch go through
      // setView (with a pitch clamp); roll uses ``camera.twistRight``
      // which rotates the up vector around the direction axis. The
      // distinction matters: twistRight leaves heading + pitch
      // numerically identical (direction is unchanged), whereas
      // setView round-trips heading→direction→heading and can
      // compound float drift across many frames — that drift was the
      // source of the spinning-on-activation bug.
      const yawSign = clampUnit(((k['arrowleft'] ? 1 : 0) - (k['arrowright'] ? 1 : 0)) + (ti?.yaw ?? 0))
      const pitchSign = clampUnit(((k['arrowup'] ? 1 : 0) - (k['arrowdown'] ? 1 : 0)) + (ti?.pitch ?? 0))
      const rollSign = (k['e'] ? 1 : 0) - (k['q'] ? 1 : 0)

      const cam = v.camera
      const rate = CesiumMath.toRadians(turnRateRef.current) * dt

      const rollActive = rollSign !== 0
      // Auto-level only fires AFTER the user has actually rolled.
      // Cameras that arrive with residual roll (flyTo, look-around,
      // accumulated float drift) no longer trigger spurious
      // corrections at activation.
      const rollDrifting = !rollActive
        && hasRolledRef.current
        && Math.abs(cam.roll) > ROLL_EPSILON_RAD

      isMovingRef.current = fwd !== 0 || right !== 0 || up !== 0
        || yawSign !== 0 || pitchSign !== 0 || rollActive

      // Yaw / pitch — only call setView when the user is actually
      // pressing one of these axes. The clamp matters here because
      // pitch shouldn't pass ±89° at the gimbal-lock singularity.
      if (yawSign !== 0 || pitchSign !== 0) {
        const heading = cam.heading + yawSign * rate
        const rawPitch = cam.pitch + pitchSign * rate
        const pitch = Math.max(-PITCH_LIMIT_RAD, Math.min(PITCH_LIMIT_RAD, rawPitch))
        cam.setView({
          destination: cam.position,
          orientation: { heading, pitch, roll: cam.roll },
        })
      }

      // Roll — active or auto-level. ``twistRight(+amount)`` banks
      // right, ``twistRight(-amount)`` banks left. Direction is the
      // axis of rotation, so heading and pitch are unchanged by
      // construction (no float drift on those axes).
      if (rollActive) {
        // Clamp: only apply the portion of `rate` that keeps roll
        // inside ±ROLL_LIMIT_RAD. ``twistRight(0)`` is a cheap no-op
        // so the gate falls through naturally when already at limit.
        const projected = cam.roll + rollSign * rate
        let step = rollSign * rate
        if (Math.abs(projected) > ROLL_LIMIT_RAD) {
          const allowed = Math.max(0, ROLL_LIMIT_RAD - Math.abs(cam.roll))
          step = rollSign * Math.min(rate, allowed)
        }
        if (step !== 0) cam.twistRight(step)
      } else if (rollDrifting) {
        // Ease back to wings-level at AUTO_LEVEL_DEG_PER_SEC. The
        // ``Math.min`` against |cam.roll| prevents overshooting zero
        // on the final step.
        const levelStep = CesiumMath.toRadians(AUTO_LEVEL_DEG_PER_SEC) * dt
        const dir = cam.roll > 0 ? -1 : 1
        const step = dir * Math.min(levelStep, Math.abs(cam.roll))
        cam.twistRight(step)
        // Once we've drifted inside the epsilon, drop the flag so
        // the loop stops firing until the user rolls again.
        if (Math.abs(cam.roll) <= ROLL_EPSILON_RAD) {
          hasRolledRef.current = false
        }
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
    // Force the clock to tick. In a static scene shouldAnimate is false
    // and onTick never fires — locomotion silently does nothing. Save
    // the previous value so we can restore it exactly on deactivation.
    savedShouldAnimateRef.current = viewer.clock.shouldAnimate
    viewer.clock.shouldAnimate = true

    const removeTick = viewer.clock.onTick.addEventListener(onTick)

    return () => {
      removeTick()
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      // Restore clock animation state on cleanup (covers the case where
      // the component unmounts while active, bypassing the !active path).
      if (savedShouldAnimateRef.current !== null) {
        viewer.clock.shouldAnimate = savedShouldAnimateRef.current
        savedShouldAnimateRef.current = null
      }
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
