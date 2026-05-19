import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Cartesian3, Cartographic, Math as CesiumMathLib, HeadingPitchRange, BoundingSphere,
} from 'cesium'
import type { Viewer as CesiumViewer } from 'cesium'
import type { NavigableSpace, PathConstraintResult } from './types'
import { buildPathEnu, constrainToPath } from './constraint'

/** useProbe — orchestrates entry/exit + per-frame constraint of the
 *  Cesium camera against a NavigableSpace. Returns the active probe
 *  state so the UI (overlay vignette, HUD) can react.
 *
 *  Frame loop strategy: a `preRender` listener on the scene reads the
 *  camera's intended position (set by Cesium's own controller or by
 *  our Fly inputs), runs the constraint solver, and writes back the
 *  clamped position before render. This means our constraint applies
 *  to any input source (manual drag, Fly widget, keyboard, story
 *  playback).
 */

export interface ProbeState {
  /** Currently active NavigableSpace, or null when not probing. */
  active: NavigableSpace | null
  /** Centerline parameter t ∈ [0,1] (path probes only). */
  t: number
  /** Distance from centerline at the current frame. */
  perpDistance: number
  /** Damp fraction 0..1 — drives the UI vignette opacity. */
  dampFraction: number
  /** Forward tangent for the HUD compass / step-arrow rendering. */
  tangent: [number, number, number] | null
}

const IDLE: ProbeState = {
  active: null, t: 0, perpDistance: 0, dampFraction: 0, tangent: null,
}

export interface ActivateOptions {
  /** Where the user dropped the glyph, in geographic lon/lat. The probe
   *  will fly to the nearest centerline point. Optional — without it,
   *  enters at t=0 (the first vertex). */
  dropLon?: number
  dropLat?: number
  /** Heading (radians, optional) — defaults to the tangent direction. */
  headingRad?: number
  /** Fly duration in seconds (default 1.4). */
  flyDurationS?: number
}

export function useProbe(viewer: CesiumViewer | null) {
  const [state, setState] = useState<ProbeState>(IDLE)
  const stateRef = useRef<ProbeState>(IDLE)
  stateRef.current = state

  const dampThresholdRef = useRef(0.3)
  const lastCameraPosRef = useRef<Cartesian3 | null>(null)
  const lastFrameTimeRef = useRef(performance.now())

  /** Per-frame constraint. Reads camera position; if outside radius,
   *  writes back clamped position. Also computes velocity by finite
   *  difference (since Cesium doesn't expose a controller velocity). */
  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return
    const scene = viewer.scene

    function onPreRender() {
      const active = stateRef.current.active
      if (!active) return
      try {
        const cam = viewer!.camera
        const carto = Cartographic.fromCartesian(cam.position)
        const lonDeg = CesiumMathLib.toDegrees(carto.longitude)
        const latDeg = CesiumMathLib.toDegrees(carto.latitude)

        // Estimate velocity in world Cartesian
        const now = performance.now()
        const dt = Math.max(0.001, (now - lastFrameTimeRef.current) / 1000)
        lastFrameTimeRef.current = now
        let velEnuEast = 0, velEnuNorth = 0, velEnuUp = 0
        const last = lastCameraPosRef.current
        if (last) {
          // Approximate as world-space delta; cheap approximation
          const dx = cam.position.x - last.x
          const dy = cam.position.y - last.y
          const dz = cam.position.z - last.z
          velEnuEast = dx / dt
          velEnuNorth = dy / dt
          velEnuUp = dz / dt
        }
        lastCameraPosRef.current = Cartesian3.clone(cam.position)

        const result: PathConstraintResult | null = constrainToPath({
          targetLonLatH: [lonDeg, latDeg, carto.height],
          velocityEnu: [velEnuEast, velEnuNorth, velEnuUp],
          space: active,
          dampThreshold: dampThresholdRef.current,
        })

        if (!result) return

        // Write clamped position back to the camera (only when constraint
        // actually moved us — avoids fighting the camera controller).
        const dx = result.position[0] - lonDeg
        const dy = result.position[1] - latDeg
        const dh = result.position[2] - carto.height
        const movedDeg = Math.hypot(dx, dy)
        const movedH = Math.abs(dh)
        if (movedDeg > 1e-9 || movedH > 0.001) {
          const corrected = Cartesian3.fromDegrees(result.position[0], result.position[1], result.position[2])
          cam.position = corrected
        }

        // Update UI state at lower frequency than 60 fps to avoid React thrash
        setState((s) => {
          const same =
            Math.abs(s.t - result.t) < 0.001 &&
            Math.abs(s.perpDistance - result.perpDistance) < 0.005 &&
            Math.abs(s.dampFraction - result.dampFraction) < 0.02
          if (same) return s
          return {
            ...s,
            t: result.t,
            perpDistance: result.perpDistance,
            dampFraction: result.dampFraction,
            tangent: result.tangent,
          }
        })
      } catch {
        /* viewer destroyed mid-frame, give up this tick */
      }
    }

    const remove = scene.preRender.addEventListener(onPreRender)
    return () => {
      try {
        if (!viewer.isDestroyed()) {
          remove()
        }
      } catch {
        /* scene already disposed */
      }
    }
  }, [viewer])

  /** Activate Probe on a NavigableSpace. Flies the camera to the entry
   *  point (or specified drop point), then engages the per-frame
   *  constraint. */
  const activate = useCallback(
    async (space: NavigableSpace, opts: ActivateOptions = {}) => {
      if (!viewer || viewer.isDestroyed()) return
      if (space.kind !== 'path' || !space.pathGeometry) {
        // Volume support comes in Phase E; bail with a sensible message
        return
      }

      const built = buildPathEnu(space)
      if (!built) return

      // Pick an entry point on the centerline. If a drop point given, use
      // its nearest centerline param; else start at t=0.
      let entryLon: number, entryLat: number, entryH: number
      let tangent: [number, number, number]
      if (opts.dropLon !== undefined && opts.dropLat !== undefined) {
        // Project drop onto centerline (in world Cartesian → ENU)
        const dropWorld = Cartesian3.fromDegrees(opts.dropLon, opts.dropLat, space.pathGeometry.vertices[0][2])
        const dropEnu = (() => {
          const rel = Cartesian3.subtract(dropWorld, built.frame.origin, new Cartesian3())
          return [
            Cartesian3.dot(rel, built.frame.east),
            Cartesian3.dot(rel, built.frame.north),
            Cartesian3.dot(rel, built.frame.up),
          ] as [number, number, number]
        })()
        // Use the constraint solver in inert-velocity mode to find the closest centerline point
        const r = constrainToPath({
          targetLonLatH: [opts.dropLon, opts.dropLat, space.pathGeometry.vertices[0][2]],
          velocityEnu: [0, 0, 0],
          space,
          dampThreshold: dampThresholdRef.current,
        })
        if (!r) return
        entryLon = r.position[0]
        entryLat = r.position[1]
        entryH = r.position[2]
        tangent = r.tangent
        void dropEnu
      } else {
        entryLon = space.pathGeometry.vertices[0][0]
        entryLat = space.pathGeometry.vertices[0][1]
        entryH = space.pathGeometry.vertices[0][2]
        // Tangent from segment 0
        const v0 = built.enu[0]
        const v1 = built.enu[1]
        const segLen = built.lengths[0]
        tangent = [(v1[0] - v0[0]) / segLen, (v1[1] - v0[1]) / segLen, (v1[2] - v0[2]) / segLen]
      }

      // Heading: angle of tangent in EN plane (north=0, east=+90°)
      const tangentEnu = tangent
      const headingRad =
        opts.headingRad ??
        Math.atan2(tangentEnu[0], tangentEnu[1])

      // Fly the camera to the entry point
      return new Promise<void>((resolve) => {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(entryLon, entryLat, entryH),
          orientation: {
            heading: headingRad,
            pitch: 0,
            roll: 0,
          },
          duration: opts.flyDurationS ?? 1.4,
          complete: () => {
            setState({ active: space, t: 0, perpDistance: 0, dampFraction: 0, tangent: tangentEnu })
            resolve()
          },
          cancel: () => resolve(),
        })
      })
    },
    [viewer],
  )

  /** Exit Probe — restore the camera to a sensible surface vantage and
   *  release the constraint. */
  const exit = useCallback(
    async (opts: { surfaceHeightM?: number; flyDurationS?: number } = {}) => {
      if (!viewer || viewer.isDestroyed()) {
        setState(IDLE)
        return
      }
      const surfaceH = opts.surfaceHeightM ?? 60
      try {
        const carto = Cartographic.fromCartesian(viewer.camera.position)
        const lonDeg = CesiumMathLib.toDegrees(carto.longitude)
        const latDeg = CesiumMathLib.toDegrees(carto.latitude)
        await new Promise<void>((resolve) => {
          viewer.camera.flyToBoundingSphere(
            new BoundingSphere(Cartesian3.fromDegrees(lonDeg, latDeg, 0), 0),
            {
              duration: opts.flyDurationS ?? 1.2,
              offset: new HeadingPitchRange(0, CesiumMathLib.toRadians(-45), surfaceH),
              complete: resolve,
              cancel: resolve,
            },
          )
        })
      } catch {
        /* viewer destroyed; just clear state */
      }
      setState(IDLE)
    },
    [viewer],
  )

  const setDampThreshold = useCallback((m: number) => {
    dampThresholdRef.current = m
  }, [])

  return { state, activate, exit, setDampThreshold }
}
