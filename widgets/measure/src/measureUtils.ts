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

/** Metres → human-readable distance string. */
export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${meters.toFixed(1)} m`
}

/** Square metres → human-readable area string. */
export function formatArea(sqMeters: number): string {
  if (sqMeters >= 1_000_000) return `${(sqMeters / 1_000_000).toFixed(2)} km²`
  if (sqMeters >= 10_000) return `${(sqMeters / 10_000).toFixed(2)} ha`
  return `${sqMeters.toFixed(0)} m²`
}
