import { Cartesian3, Cartographic } from 'cesium'

/** Earth radius used for spherical-polygon area calculations (metres). */
const EARTH_RADIUS_M = 6_371_000

/** Sum of Cartesian distances between consecutive points, in metres. */
export function computePolylineDistance(points: Cartesian3[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) {
    d += Cartesian3.distance(points[i - 1]!, points[i]!)
  }
  return d
}

/**
 * Spherical-polygon area in square metres for a closed ring defined by the
 * given positions. Returns 0 if fewer than 3 positions.
 */
export function computePolygonArea(positions: Cartesian3[]): number {
  if (positions.length < 3) return 0
  const cartos = positions.map((p) => Cartographic.fromCartesian(p))
  let sum = 0
  for (let i = 0; i < cartos.length; i++) {
    const a = cartos[i]!
    const b = cartos[(i + 1) % cartos.length]!
    const dLon = b.longitude - a.longitude
    sum += dLon * (Math.sin(a.latitude) + Math.sin(b.latitude))
  }
  return Math.abs((sum * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2)
}

export type LengthUnit = 'metric' | 'imperial'

const FEET_PER_METRE = 3.280839895013123
const FEET_PER_MILE = 5280
const SQFT_PER_SQM = FEET_PER_METRE * FEET_PER_METRE
const ACRES_PER_SQM = 1 / 4046.8564224
const SQMI_PER_SQM = 1 / 2_589_988.110336

/** Metres → human-readable distance string, in the chosen unit system. */
export function formatDistance(meters: number, unit: LengthUnit = 'metric'): string {
  if (unit === 'imperial') {
    const feet = meters * FEET_PER_METRE
    if (Math.abs(feet) >= FEET_PER_MILE)
      return `${(feet / FEET_PER_MILE).toFixed(2)} mi`
    return `${feet.toFixed(1)} ft`
  }
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${meters.toFixed(1)} m`
}

/** Square metres → human-readable area string, in the chosen unit system. */
export function formatArea(sqMeters: number, unit: LengthUnit = 'metric'): string {
  if (unit === 'imperial') {
    const sqft = sqMeters * SQFT_PER_SQM
    const sqmi = sqMeters * SQMI_PER_SQM
    const acres = sqMeters * ACRES_PER_SQM
    if (sqmi >= 1) return `${sqmi.toFixed(2)} mi²`
    if (acres >= 1) return `${acres.toFixed(2)} ac`
    return `${sqft.toFixed(0)} ft²`
  }
  if (sqMeters >= 1_000_000) return `${(sqMeters / 1_000_000).toFixed(2)} km²`
  if (sqMeters >= 10_000) return `${(sqMeters / 10_000).toFixed(2)} ha`
  return `${sqMeters.toFixed(0)} m²`
}
