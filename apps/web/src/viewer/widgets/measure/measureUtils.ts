import { Cartesian3, Cartographic, Math as CesiumMath } from 'cesium'
import type { PointMeasurement } from './types'

export function computePolylineDistance(points: Cartesian3[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) {
    d += Cartesian3.distance(points[i - 1], points[i])
  }
  return d
}

export function computeSegmentDistances(points: Cartesian3[]): number[] {
  const out: number[] = []
  for (let i = 1; i < points.length; i++) {
    out.push(Cartesian3.distance(points[i - 1], points[i]))
  }
  return out
}

export function computePolygonArea(positions: Cartesian3[]): number {
  if (positions.length < 3) return 0
  const cartos = positions.map(p => Cartographic.fromCartesian(p))
  const R = 6371000
  let sum = 0
  for (let i = 0; i < cartos.length; i++) {
    const j = (i + 1) % cartos.length
    const dLon = cartos[j].longitude - cartos[i].longitude
    sum += dLon * (Math.sin(cartos[i].latitude) + Math.sin(cartos[j].latitude))
  }
  return Math.abs(sum * R * R / 2)
}

export function cartesianToPoint(pos: Cartesian3): PointMeasurement {
  const c = Cartographic.fromCartesian(pos)
  return {
    longitude: CesiumMath.toDegrees(c.longitude),
    latitude: CesiumMath.toDegrees(c.latitude),
    height: c.height,
  }
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`
  return `${Math.round(meters)} m`
}

export function formatArea(sqMeters: number): string {
  if (sqMeters >= 1_000_000) return `${(sqMeters / 1_000_000).toFixed(2)} km²`
  if (sqMeters >= 10_000) return `${(sqMeters / 10_000).toFixed(1)} ha`
  return `${Math.round(sqMeters)} m²`
}

export function formatLatitude(deg: number): string {
  return `${deg.toFixed(4)}° ${deg >= 0 ? 'N' : 'S'}`
}

export function formatLongitude(deg: number): string {
  return `${deg.toFixed(4)}° ${deg >= 0 ? 'E' : 'W'}`
}

export function formatElevation(meters: number): string {
  return `${meters.toFixed(1)} m`
}
