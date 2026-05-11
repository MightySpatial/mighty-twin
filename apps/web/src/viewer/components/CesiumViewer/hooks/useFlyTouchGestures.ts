/** Mobile fly-mode touch gestures.
 *
 *  Listens to pointer events on the viewer canvas and translates them
 *  into a FlyTouchIntent that the existing useFlyMode tick loop reads
 *  alongside keyboard state. No synthetic keyboard events — the intent
 *  is plumbed as a ref so we don't trigger React renders on every
 *  frame's motion update.
 *
 *  Gestures:
 *    - 1 finger drag  → translate (forward/back/strafe). Drag up =
 *      forward, drag down = back, drag left/right = strafe.
 *    - 2 finger drag  → look (pitch/yaw). Drag up = pitch up,
 *      drag left = yaw left.
 *    - Pinch (2-finger distance change) → gear shift. Expanding by
 *      one "step" (configurable) shifts up; collapsing shifts down.
 *      Cooldown prevents one pinch from skipping multiple gears.
 *
 *  All thresholds are tuned for the canvas size; sensitivities are
 *  in "fraction of viewport" so phones and tablets feel similar.
 *
 *  Only active when both `active` is true (fly mode on) and the
 *  device is touch-capable. Disabling tears down the listener and
 *  zeroes the intent. */

import { useEffect, useRef } from 'react'
import type { Viewer as CesiumViewerType } from 'cesium'
import type { FlyTouchIntent } from './useFlyMode'

/** Reset all axes to zero. */
function zeroIntent(intent: FlyTouchIntent): void {
  intent.forward = 0
  intent.right = 0
  intent.up = 0
  intent.yaw = 0
  intent.pitch = 0
}

/** Min drag distance (in px) before any axis fires — kills jitter on
 *  fingers that haven't moved enough to count as a swipe. */
const DEAD_ZONE_PX = 6

/** Pinch sensitivity — distance change (in px) per gear shift. */
const PINCH_GEAR_STEP_PX = 90

/** Cooldown (ms) between gear shifts so a continuous pinch doesn't
 *  spam shifts over multiple frames. */
const GEAR_COOLDOWN_MS = 220

interface UseFlyTouchGesturesArgs {
  viewerRef: React.RefObject<CesiumViewerType | null>
  /** Mounted intent ref — the same ref is passed into useFlyMode so
   *  the gesture handlers' writes show up in the next tick. */
  intentRef: React.MutableRefObject<FlyTouchIntent>
  /** True only when fly mode is engaged AND the device is mobile. */
  active: boolean
  /** Gear shift via pinch. Delta=+1 expand (shift up); -1 collapse
   *  (shift down). The host owns gear state. */
  onGearShift?: (delta: 1 | -1) => void
}

export function useFlyTouchGestures({
  viewerRef,
  intentRef,
  active,
  onGearShift,
}: UseFlyTouchGesturesArgs): void {
  // Latest pointer positions, keyed by pointerId. Cleared on
  // pointerup/cancel/leave; rebuilt as pointers arrive.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map())
  // First-touch state — captured on the second pointer downing so we
  // can compute deltas from a stable origin.
  const originRef = useRef<{
    oneFingerStart: { x: number; y: number } | null
    twoFingerStart: { mid: { x: number; y: number }; dist: number } | null
    lastGearShiftAt: number
    accumulatedPinch: number
  }>({
    oneFingerStart: null,
    twoFingerStart: null,
    lastGearShiftAt: 0,
    accumulatedPinch: 0,
  })

  const onGearShiftRef = useRef(onGearShift)
  onGearShiftRef.current = onGearShift

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const canvas: HTMLCanvasElement = viewer.canvas

    if (!active) {
      zeroIntent(intentRef.current)
      pointersRef.current.clear()
      originRef.current.oneFingerStart = null
      originRef.current.twoFingerStart = null
      originRef.current.accumulatedPinch = 0
      return
    }

    const w = () => canvas.clientWidth || 1
    const h = () => canvas.clientHeight || 1

    function onDown(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      // Re-snapshot origins on every count change so transitioning
      // 1→2 fingers re-baselines correctly.
      snapshotOrigins()
      // Suppress the browser's default touch handling (page scroll,
      // pinch-zoom) so the canvas owns the gesture.
      e.preventDefault()
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      if (!pointersRef.current.has(e.pointerId)) return
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      updateIntent()
      e.preventDefault()
    }

    function onUp(e: PointerEvent) {
      if (e.pointerType !== 'touch') return
      pointersRef.current.delete(e.pointerId)
      snapshotOrigins()
      // If we dropped below 1 finger, zero the intent so the camera
      // stops at the moment the finger lifts.
      if (pointersRef.current.size === 0) zeroIntent(intentRef.current)
      else updateIntent()
    }

    function snapshotOrigins() {
      const pts = Array.from(pointersRef.current.values())
      if (pts.length === 1) {
        originRef.current.oneFingerStart = { x: pts[0].x, y: pts[0].y }
        originRef.current.twoFingerStart = null
      } else if (pts.length === 2) {
        originRef.current.oneFingerStart = null
        const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 }
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        originRef.current.twoFingerStart = { mid, dist }
        originRef.current.accumulatedPinch = 0
      } else {
        originRef.current.oneFingerStart = null
        originRef.current.twoFingerStart = null
      }
    }

    function updateIntent() {
      const pts = Array.from(pointersRef.current.values())
      const ti = intentRef.current
      zeroIntent(ti)

      if (pts.length === 1 && originRef.current.oneFingerStart) {
        const o = originRef.current.oneFingerStart
        const dx = pts[0].x - o.x
        const dy = pts[0].y - o.y
        // Forward = drag up (negative dy in screen space).
        if (Math.abs(dy) > DEAD_ZONE_PX) {
          ti.forward = clampUnit(-dy / (h() * 0.25))
        }
        if (Math.abs(dx) > DEAD_ZONE_PX) {
          ti.right = clampUnit(dx / (w() * 0.25))
        }
      } else if (pts.length === 2 && originRef.current.twoFingerStart) {
        const o = originRef.current.twoFingerStart
        const midX = (pts[0].x + pts[1].x) / 2
        const midY = (pts[0].y + pts[1].y) / 2
        const dx = midX - o.mid.x
        const dy = midY - o.mid.y
        // Pitch = drag up; yaw = drag left.
        if (Math.abs(dy) > DEAD_ZONE_PX) {
          ti.pitch = clampUnit(-dy / (h() * 0.20))
        }
        if (Math.abs(dx) > DEAD_ZONE_PX) {
          ti.yaw = clampUnit(-dx / (w() * 0.20))
        }
        // Pinch — distance change vs the captured baseline.
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
        const delta = dist - o.dist - originRef.current.accumulatedPinch
        if (Math.abs(delta) >= PINCH_GEAR_STEP_PX) {
          const now = Date.now()
          if (now - originRef.current.lastGearShiftAt >= GEAR_COOLDOWN_MS) {
            const dir = delta > 0 ? 1 : -1
            onGearShiftRef.current?.(dir)
            originRef.current.lastGearShiftAt = now
            // Accumulate the step we just consumed so the next step
            // requires another full PINCH_GEAR_STEP_PX of motion.
            originRef.current.accumulatedPinch += dir * PINCH_GEAR_STEP_PX
          }
        }
      }
    }

    canvas.addEventListener('pointerdown', onDown, { passive: false })
    canvas.addEventListener('pointermove', onMove, { passive: false })
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave', onUp)

    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onUp)
      zeroIntent(intentRef.current)
      pointersRef.current.clear()
    }
  }, [active, viewerRef, intentRef])
}

function clampUnit(x: number): number {
  return Math.max(-1, Math.min(1, x))
}
