/** flyToTarget — the canonical "fly to a thing" camera helper.
 *
 *  The two camera-fly patterns Cesium gives you have very different
 *  framing semantics:
 *
 *    flyTo({ destination: Cartesian3.fromDegrees(lon, lat, h) })
 *      — places the camera AT (lon, lat, h) staring past the spot.
 *        Useful when restoring an authored view (snapshot, story
 *        slide, ?camera URL) where the saved position IS the camera.
 *
 *    flyToBoundingSphere(target, { offset: HeadingPitchRange(...) })
 *      — places the camera at ``range`` from the target, looking AT
 *        it from the configured heading + pitch. This is the right
 *        pattern for "fly to a feature / pin / site / search hit"
 *        because the user wants to see the thing, not stand on it.
 *
 *  Use this helper for the second case. It centralises the pattern so
 *  every "zoom to a target" site-wide gets the same cinematic 45°
 *  look-down at 4.5 km range with a 2.4 s ease.
 *
 *  For authored views that should restore an exact camera state, keep
 *  using viewer.camera.flyTo({ destination, orientation }) directly.
 */

import {
  BoundingSphere,
  Cartesian3,
  HeadingPitchRange,
  Math as CesiumMath,
  type Viewer,
} from 'cesium'

export interface FlyToTargetOptions {
  longitude: number
  latitude: number
  /** Ground-relative height in metres. Defaults to 0 (sea level). */
  height?: number
  /** Distance from the target in metres. Defaults to 4500 m. */
  range?: number
  /** Compass heading in degrees (0 = north). Defaults to 0. */
  headingDeg?: number
  /** Pitch in degrees (0 = horizon, -90 = top-down). Default -45. */
  pitchDeg?: number
  /** Roll in degrees. Defaults to 0. */
  rollDeg?: number
  /** Animation duration in seconds. Defaults to 2.4 s for a cinematic
   *  feel. Pass 0 for an instant cut. */
  duration?: number
  /** Optional callback invoked when the fly completes. */
  onComplete?: () => void
}

const DEFAULT_RANGE_METRES = 4500
const DEFAULT_PITCH_DEG = -45
const DEFAULT_DURATION_SECS = 2.4

/** Fly the camera to look at (longitude, latitude, height) from
 *  ``range`` metres away at the configured heading/pitch.
 *
 *  Safe against viewer destruction mid-flight: any cesium error is
 *  swallowed silently so callers don't have to wrap each call in
 *  try/catch. Returns true when the fly was dispatched, false when
 *  the viewer was missing or already destroyed.
 */
export function flyToTarget(
  viewer: Viewer | null,
  opts: FlyToTargetOptions,
): boolean {
  if (!viewer) return false
  const {
    longitude,
    latitude,
    height = 0,
    range = DEFAULT_RANGE_METRES,
    headingDeg = 0,
    pitchDeg = DEFAULT_PITCH_DEG,
    rollDeg = 0,
    duration = DEFAULT_DURATION_SECS,
    onComplete,
  } = opts
  try {
    viewer.camera.flyToBoundingSphere(
      new BoundingSphere(Cartesian3.fromDegrees(longitude, latitude, height), 1),
      {
        offset: new HeadingPitchRange(
          CesiumMath.toRadians(headingDeg),
          CesiumMath.toRadians(pitchDeg),
          range,
        ),
        duration,
        complete: onComplete,
      },
    )
    return true
  } catch {
    return false
  }
}

/** Convenience wrapper: fly to a site's overview camera position.
 *
 *  Sites have an ``overview_camera_height`` config field that doubles
 *  as the framing range — typical Twin sites set it between 800 m
 *  (small infrastructure) and 8 km (continental). We pass it through
 *  as ``range`` rather than as a camera height because the bounding-
 *  sphere offset semantics are clearer (it's "how far away to look
 *  from", not "where the camera lives in space").
 */
export function flyToSiteOverview(
  viewer: Viewer | null,
  site: {
    longitude: number
    latitude: number
    height?: number | null
    heading?: number | null
    pitch?: number | null
  },
  overrides: Partial<FlyToTargetOptions> = {},
): boolean {
  return flyToTarget(viewer, {
    longitude: site.longitude,
    latitude: site.latitude,
    height: 0,
    range: site.height ?? DEFAULT_RANGE_METRES,
    headingDeg: site.heading ?? 0,
    pitchDeg: site.pitch ?? DEFAULT_PITCH_DEG,
    ...overrides,
  })
}
