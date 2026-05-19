import { Cartesian3 } from 'cesium'
import type { NavigableSpace, PathConstraintResult } from './types'

/** Path constraint solver — given a target camera position and the path's
 *  centerline, return a constrained position + velocity per §4.1 of
 *  mockups/PROBE.md.
 *
 *  We solve in **East-North-Up (ENU)** tangent space at the path's first
 *  vertex. This gives us a local Cartesian frame where distances are
 *  metric and centerline operations (project to polyline, clamp radius)
 *  are straightforward. Round-trip back to geographic (lon/lat/h) when
 *  returning.
 *
 *  For paths with long horizontal extent the ENU frame error grows; in
 *  practice all probe paths are < 1 km, error is < 1 cm. Volume support
 *  (§4.2) will need a similar ENU treatment.
 */

interface ENUFrame {
  origin: Cartesian3
  east: Cartesian3
  north: Cartesian3
  up: Cartesian3
}

/** Build an ENU frame at a geographic anchor (lon, lat, h). */
function enuAt(lon: number, lat: number, h: number): ENUFrame {
  const origin = Cartesian3.fromDegrees(lon, lat, h)
  // East = WGS84 east-pointing tangent
  const east = Cartesian3.normalize(
    Cartesian3.cross(Cartesian3.UNIT_Z, origin, new Cartesian3()),
    new Cartesian3(),
  )
  const upGuess = Cartesian3.normalize(origin, new Cartesian3())
  const north = Cartesian3.cross(upGuess, east, new Cartesian3())
  Cartesian3.normalize(north, north)
  const up = Cartesian3.cross(east, north, new Cartesian3())
  Cartesian3.normalize(up, up)
  return { origin, east, north, up }
}

/** World Cartesian → ENU local coords (meters relative to frame.origin). */
function worldToEnu(p: Cartesian3, frame: ENUFrame): [number, number, number] {
  const rel = Cartesian3.subtract(p, frame.origin, new Cartesian3())
  return [
    Cartesian3.dot(rel, frame.east),
    Cartesian3.dot(rel, frame.north),
    Cartesian3.dot(rel, frame.up),
  ]
}

/** ENU local coords → world Cartesian. */
function enuToWorld(e: [number, number, number], frame: ENUFrame): Cartesian3 {
  const result = Cartesian3.clone(frame.origin)
  Cartesian3.add(result, Cartesian3.multiplyByScalar(frame.east, e[0], new Cartesian3()), result)
  Cartesian3.add(result, Cartesian3.multiplyByScalar(frame.north, e[1], new Cartesian3()), result)
  Cartesian3.add(result, Cartesian3.multiplyByScalar(frame.up, e[2], new Cartesian3()), result)
  return result
}

/** Build the ENU-frame polyline for a NavigableSpace of kind='path'. */
export function buildPathEnu(space: NavigableSpace): { enu: Array<[number, number, number]>; frame: ENUFrame; lengths: number[]; totalLength: number } | null {
  if (space.kind !== 'path' || !space.pathGeometry) return null
  const verts = space.pathGeometry.vertices
  if (verts.length < 2) return null

  const anchor = verts[0]
  const frame = enuAt(anchor[0], anchor[1], anchor[2])
  const enu = verts.map((v) => {
    const p = Cartesian3.fromDegrees(v[0], v[1], v[2])
    return worldToEnu(p, frame)
  })

  // Segment lengths
  const lengths: number[] = []
  let total = 0
  for (let i = 1; i < enu.length; i++) {
    const d = Math.hypot(
      enu[i][0] - enu[i - 1][0],
      enu[i][1] - enu[i - 1][1],
      enu[i][2] - enu[i - 1][2],
    )
    lengths.push(d)
    total += d
  }

  return { enu, frame, lengths, totalLength: total }
}

/** Find nearest point on a polyline to a given point, in the ENU frame.
 *  Returns the closest point, the parameter t ∈ [0,1], and the tangent. */
function nearestOnPolyline(
  enu: Array<[number, number, number]>,
  lengths: number[],
  totalLength: number,
  query: [number, number, number],
): {
  closest: [number, number, number]
  t: number
  tangent: [number, number, number]
  segIndex: number
} {
  let bestDist2 = Infinity
  let bestClosest: [number, number, number] = enu[0]
  let bestT = 0
  let bestTangent: [number, number, number] = [1, 0, 0]
  let bestSeg = 0

  let cumLen = 0
  for (let i = 0; i < enu.length - 1; i++) {
    const a = enu[i]
    const b = enu[i + 1]
    const ax = a[0], ay = a[1], az = a[2]
    const bx = b[0], by = b[1], bz = b[2]
    const dx = bx - ax, dy = by - ay, dz = bz - az
    const segLen = lengths[i]
    if (segLen < 1e-9) continue

    // Project query onto segment
    const qx = query[0] - ax, qy = query[1] - ay, qz = query[2] - az
    const dot = qx * dx + qy * dy + qz * dz
    const tSeg = Math.max(0, Math.min(1, dot / (segLen * segLen)))
    const cx = ax + tSeg * dx
    const cy = ay + tSeg * dy
    const cz = az + tSeg * dz
    const ddx = query[0] - cx
    const ddy = query[1] - cy
    const ddz = query[2] - cz
    const dist2 = ddx * ddx + ddy * ddy + ddz * ddz
    if (dist2 < bestDist2) {
      bestDist2 = dist2
      bestClosest = [cx, cy, cz]
      bestT = (cumLen + tSeg * segLen) / totalLength
      bestTangent = [dx / segLen, dy / segLen, dz / segLen]
      bestSeg = i
    }
    cumLen += segLen
  }

  return { closest: bestClosest, t: bestT, tangent: bestTangent, segIndex: bestSeg }
}

export interface ConstrainInputs {
  /** Target camera position in geographic (lon, lat, h(m)). */
  targetLonLatH: [number, number, number]
  /** Velocity in ENU local frame (m/s east, m/s north, m/s up). */
  velocityEnu: [number, number, number]
  /** Path being navigated. */
  space: NavigableSpace
  /** Damp threshold (m). Defaults from settings. */
  dampThreshold: number
  /** Frame epsilon — small offset inside the radius wall to avoid jitter. */
  epsilon?: number
}

/** Main entry — solve path constraint per §4.1 of PROBE.md. */
export function constrainToPath(inp: ConstrainInputs): PathConstraintResult | null {
  if (inp.space.kind !== 'path') return null
  const built = buildPathEnu(inp.space)
  if (!built) return null

  const radius = inp.space.crossSectionRadiusM ?? 0.5
  const epsilon = inp.epsilon ?? Math.min(0.02, radius * 0.05)
  const targetWorld = Cartesian3.fromDegrees(
    inp.targetLonLatH[0],
    inp.targetLonLatH[1],
    inp.targetLonLatH[2],
  )
  const targetEnu = worldToEnu(targetWorld, built.frame)

  // 1. Find nearest centerline point
  const { closest, t, tangent } = nearestOnPolyline(built.enu, built.lengths, built.totalLength, targetEnu)

  // 2. Decompose offset into along-tangent (allowed) and perpendicular (constrained)
  const offsetX = targetEnu[0] - closest[0]
  const offsetY = targetEnu[1] - closest[1]
  const offsetZ = targetEnu[2] - closest[2]
  const alongComp = offsetX * tangent[0] + offsetY * tangent[1] + offsetZ * tangent[2]
  const perpX = offsetX - alongComp * tangent[0]
  const perpY = offsetY - alongComp * tangent[1]
  const perpZ = offsetZ - alongComp * tangent[2]
  const perpDistance = Math.hypot(perpX, perpY, perpZ)

  // 3. Hard clamp if outside the radius
  let constrainedEnu: [number, number, number] = [targetEnu[0], targetEnu[1], targetEnu[2]]
  if (perpDistance > radius - epsilon) {
    const allowed = radius - epsilon
    const k = allowed / perpDistance
    constrainedEnu = [
      closest[0] + perpX * k + alongComp * tangent[0],
      closest[1] + perpY * k + alongComp * tangent[1],
      closest[2] + perpZ * k + alongComp * tangent[2],
    ]
  }

  // 4. Soft damp — if d_perp > 0.6 * r (or within dampThreshold of the wall,
  //    whichever is larger), damp the outward component of velocity.
  let velOut: [number, number, number] = [inp.velocityEnu[0], inp.velocityEnu[1], inp.velocityEnu[2]]
  const softBand = Math.max(0.6 * radius, radius - inp.dampThreshold)
  if (perpDistance > softBand && perpDistance > 1e-6) {
    const radialUnit: [number, number, number] = [perpX / perpDistance, perpY / perpDistance, perpZ / perpDistance]
    const vRadial = velOut[0] * radialUnit[0] + velOut[1] * radialUnit[1] + velOut[2] * radialUnit[2]
    if (vRadial > 0) {
      // damp 0 at softBand, 1 at radius
      const damp = Math.min(1, Math.max(0, (perpDistance - softBand) / (radius - softBand)))
      velOut = [
        velOut[0] - radialUnit[0] * vRadial * damp,
        velOut[1] - radialUnit[1] * vRadial * damp,
        velOut[2] - radialUnit[2] * vRadial * damp,
      ]
    }
  }

  // 5. Convert constrained position back to geographic
  const constrainedWorld = enuToWorld(constrainedEnu, built.frame)
  // Cesium has Cartographic.fromCartesian, but we want degrees directly:
  // Re-derive via Cartographic:
  const Cartographic = (Cartesian3 as unknown as {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [k: string]: any
  }) // placeholder to keep top-level import minimal

  void Cartographic
  // Use the global Cartographic from cesium import below:
  const carto = cartographicFromCartesian(constrainedWorld)

  // Damp fraction for visual feedback
  const dampFraction = Math.min(1, Math.max(0, (perpDistance - softBand) / (radius - softBand)))

  return {
    position: [
      carto.lonDeg,
      carto.latDeg,
      carto.h,
    ],
    velocity: velOut,
    t,
    perpDistance,
    dampFraction,
    tangent,
  }
}

/** Tiny helper to extract lonDeg/latDeg/h from a Cartesian3 — Cesium's
 *  Cartographic.fromCartesian gives radians; we want degrees. Encoded as
 *  a function so the constraint module's import surface stays tiny. */
function cartographicFromCartesian(p: Cartesian3): { lonDeg: number; latDeg: number; h: number } {
  // Lazy import to keep this module's top-level cheap; in practice Cesium
  // is already loaded. We import Cartographic at module top.
  // (we'll add the import below)
  const c = CartographicRef.fromCartesian(p)
  return {
    lonDeg: (c.longitude * 180) / Math.PI,
    latDeg: (c.latitude * 180) / Math.PI,
    h: c.height,
  }
}

// Cesium Cartographic — imported lazily to avoid circular import surface.
import { Cartographic as CartographicRef } from 'cesium'

/** Volume constraint — Phase E.
 *
 *  For kind='volume' NavigableSpaces with an AABB defined on the volume
 *  geometry, clamp the camera to remain inside the box. AABB is in
 *  geographic coordinates (minLon/minLat/minH → maxLon/maxLat/maxH).
 *
 *  Mesh-SDF support (true polyhedral surface with arbitrary geometry)
 *  ships in a follow-up when we wire in the three-mesh-bvh dep — for
 *  v1, AABB covers the dominant use case (rectangular rooms, pits).
 */
export interface VolumeConstraintInputs {
  targetLonLatH: [number, number, number]
  velocityEnu: [number, number, number]
  space: { volumeGeometry?: { bbox?: { minLon: number; minLat: number; minH: number; maxLon: number; maxLat: number; maxH: number } } }
  dampThreshold: number
}

export interface VolumeConstraintResult {
  position: [number, number, number]
  velocity: [number, number, number]
  dampFraction: number
  /** Which face the camera is nearest to: 0=W,1=E,2=S,3=N,4=Down,5=Up. */
  nearestFace: number
  /** Distance to that face in meters. */
  distanceToFace: number
}

export function constrainToVolume(inp: VolumeConstraintInputs): VolumeConstraintResult | null {
  const bbox = inp.space.volumeGeometry?.bbox
  if (!bbox) return null

  const [lon, lat, h] = inp.targetLonLatH
  // Hard clamp: keep inside the AABB. We accept some lat/lon non-metric
  // imprecision at the wall — for room-scale (< 50 m) this is sub-cm.
  const clampedLon = Math.max(bbox.minLon, Math.min(bbox.maxLon, lon))
  const clampedLat = Math.max(bbox.minLat, Math.min(bbox.maxLat, lat))
  const clampedH = Math.max(bbox.minH, Math.min(bbox.maxH, h))

  // Distance-to-face calculation (in approximate meters).
  // Use the local metric scale for lon/lat at this latitude.
  const metersPerDegLat = 110540
  const metersPerDegLon = 111320 * Math.cos(((bbox.minLat + bbox.maxLat) / 2) * Math.PI / 180)
  const dW = Math.abs(clampedLon - bbox.minLon) * metersPerDegLon
  const dE = Math.abs(bbox.maxLon - clampedLon) * metersPerDegLon
  const dS = Math.abs(clampedLat - bbox.minLat) * metersPerDegLat
  const dN = Math.abs(bbox.maxLat - clampedLat) * metersPerDegLat
  const dDown = Math.abs(clampedH - bbox.minH)
  const dUp = Math.abs(bbox.maxH - clampedH)

  const faces = [dW, dE, dS, dN, dDown, dUp]
  let minDist = faces[0]
  let minIdx = 0
  for (let i = 1; i < 6; i++) {
    if (faces[i] < minDist) {
      minDist = faces[i]
      minIdx = i
    }
  }

  // Soft damp: velocity into the nearest wall is damped within `dampThreshold` of it.
  let velOut: [number, number, number] = [inp.velocityEnu[0], inp.velocityEnu[1], inp.velocityEnu[2]]
  if (minDist < inp.dampThreshold) {
    const damp = 1 - minDist / inp.dampThreshold
    // ENU vector pointing toward the wall
    const wallDir: [number, number, number] = [0, 0, 0]
    if (minIdx === 0) wallDir[0] = -1
    else if (minIdx === 1) wallDir[0] = 1
    else if (minIdx === 2) wallDir[1] = -1
    else if (minIdx === 3) wallDir[1] = 1
    else if (minIdx === 4) wallDir[2] = -1
    else if (minIdx === 5) wallDir[2] = 1
    const vIntoWall = velOut[0] * wallDir[0] + velOut[1] * wallDir[1] + velOut[2] * wallDir[2]
    if (vIntoWall > 0) {
      velOut = [
        velOut[0] - wallDir[0] * vIntoWall * damp,
        velOut[1] - wallDir[1] * vIntoWall * damp,
        velOut[2] - wallDir[2] * vIntoWall * damp,
      ]
    }
  }

  const dampFraction = Math.max(0, 1 - minDist / inp.dampThreshold)

  return {
    position: [clampedLon, clampedLat, clampedH],
    velocity: velOut,
    dampFraction,
    nearestFace: minIdx,
    distanceToFace: minDist,
  }
}
