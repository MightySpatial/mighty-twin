/**
 * MightyTwin — Edit Panel Helpers
 * Pure utility functions for coordinate transforms and feature anchor extraction.
 */
import type { Viewer as CesiumViewerType } from 'cesium'
import { Cartesian3, JulianDate, PolygonHierarchy } from 'cesium'
import type { SketchFeature } from '../types'
import { cartesianToDegrees } from '../tools/drawUtils'

const R_EARTH = 6_371_000 // mean WGS84 radius in metres

/** Compute destination point from bearing (deg), distance (m), elevation delta (m). */
export function geodesicOffset(
  lon: number, lat: number, alt: number,
  bearingDeg: number, distanceM: number, altDeltaM: number,
): [number, number, number] {
  const phi1 = (lat * Math.PI) / 180
  const lam1 = (lon * Math.PI) / 180
  const theta = (bearingDeg * Math.PI) / 180
  const delta = distanceM / R_EARTH

  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta))
  const lam2 = lam1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(phi1), Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2))

  return [(lam2 * 180) / Math.PI, (phi2 * 180) / Math.PI, alt + altDeltaM]
}

/** Apply ENU delta (metres) to a lon/lat/alt anchor. */
export function enuDelta(
  lon: number, lat: number, alt: number,
  dE: number, dN: number, dAlt: number,
): [number, number, number] {
  const latRad = (lat * Math.PI) / 180
  const newLat = lat + dN / 111_320
  const newLon = lon + dE / (111_320 * Math.cos(latRad))
  return [newLon, newLat, alt + dAlt]
}

/** Get the primary anchor [lon, lat, alt] of any SketchFeature. */
export function getAnchor(feature: SketchFeature, viewer: CesiumViewerType): [number, number, number] | null {
  const isSolid = feature.geometry === 'box' || feature.geometry === 'pit' || feature.geometry === 'cylinder'
  if (isSolid) {
    const a = feature.attributes as Record<string, unknown>
    if (typeof a.lon === 'number' && typeof a.lat === 'number' && typeof a.alt === 'number') {
      return [a.lon, a.lat, a.alt]
    }
  }
  const ent = viewer.entities.getById(feature.entityId)
  if (!ent) return null
  const now = JulianDate.now()
  if (ent.position) {
    const pos = ent.position.getValue(now)
    if (pos) return cartesianToDegrees(pos)
  }
  if (ent.polyline?.positions) {
    const arr: Cartesian3[] = ent.polyline.positions.getValue(now) ?? []
    if (arr.length) {
      const sum = arr.reduce((acc, p) => Cartesian3.add(acc, p, new Cartesian3()), new Cartesian3())
      return cartesianToDegrees(new Cartesian3(sum.x / arr.length, sum.y / arr.length, sum.z / arr.length))
    }
  }
  if (ent.polygon?.hierarchy) {
    const h = ent.polygon.hierarchy.getValue(now) as PolygonHierarchy | undefined
    if (h?.positions?.length) {
      const sum = h.positions.reduce((acc, p) => Cartesian3.add(acc, p, new Cartesian3()), new Cartesian3())
      return cartesianToDegrees(new Cartesian3(sum.x / h.positions.length, sum.y / h.positions.length, sum.z / h.positions.length))
    }
  }
  return null
}

export const GEOM_LABELS: Record<string, string> = {
  point: 'Point', line: 'Line', polygon: 'Polygon', rectangle: 'Rect',
  circle: 'Circle', traverse: 'Traverse', box: 'Box', pit: 'Pit', cylinder: 'Cylinder', other: '?',
}
