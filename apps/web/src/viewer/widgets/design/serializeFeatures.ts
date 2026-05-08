/** SketchFeature → GeoJSON Feature serialization (T+420).
 *
 *  The Design widget's SketchFeature stores everything *except* the
 *  geometry — the live geometry lives on the Cesium Entity. To submit
 *  features for moderation we need to walk those entities and extract
 *  GeoJSON Feature payloads matching the contract the
 *  /api/design/submissions endpoint expects.
 *
 *  We support point, line/polyline, polygon, rectangle, and circle.
 *  Solid forms (box / pit / cylinder) decompose to their footprint
 *  polygon — the platform's authoritative storage is 2D + height; the
 *  3D solid params live in the feature properties for round-trip.
 */

import {
  Cartesian3,
  Cartographic,
  Math as CesiumMath,
  type Entity,
  type Viewer,
  JulianDate,
} from 'cesium'
import type { SketchFeature, SketchLayer } from './types'

interface GeoJSONPoint {
  type: 'Point'
  coordinates: [number, number, number?]
}
interface GeoJSONLineString {
  type: 'LineString'
  coordinates: [number, number, number?][]
}
interface GeoJSONPolygon {
  type: 'Polygon'
  coordinates: [number, number, number?][][]
}

type GeoJSONGeometry = GeoJSONPoint | GeoJSONLineString | GeoJSONPolygon

interface GeoJSONFeature {
  type: 'Feature'
  id: string
  geometry: GeoJSONGeometry
  properties: Record<string, unknown>
}

const NOW = JulianDate.now()

function cartesianToLngLat(c: Cartesian3): [number, number, number] {
  const carto = Cartographic.fromCartesian(c)
  return [
    CesiumMath.toDegrees(carto.longitude),
    CesiumMath.toDegrees(carto.latitude),
    carto.height,
  ]
}

function entityGeometry(entity: Entity): GeoJSONGeometry | null {
  // Point: entity.position is set.
  if (entity.point || (entity.billboard && entity.position)) {
    const pos = entity.position?.getValue(NOW)
    if (!pos) return null
    return { type: 'Point', coordinates: cartesianToLngLat(pos) }
  }

  // Line / polyline.
  if (entity.polyline) {
    const positions = entity.polyline.positions?.getValue(NOW) as Cartesian3[] | undefined
    if (!positions || positions.length === 0) return null
    return {
      type: 'LineString',
      coordinates: positions.map(cartesianToLngLat),
    }
  }

  // Polygon.
  if (entity.polygon) {
    const hierarchy = entity.polygon.hierarchy?.getValue(NOW) as
      | { positions: Cartesian3[] }
      | Cartesian3[]
      | undefined
    const ring = Array.isArray(hierarchy) ? hierarchy : hierarchy?.positions
    if (!ring || ring.length === 0) return null
    const coords = ring.map(cartesianToLngLat)
    // Close the ring if the first ≠ last (GeoJSON requires closed rings).
    const first = coords[0]
    const last = coords[coords.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) coords.push(first)
    return { type: 'Polygon', coordinates: [coords] }
  }

  // Rectangle — convert to polygon (4 corners).
  if (entity.rectangle) {
    const rect = entity.rectangle.coordinates?.getValue(NOW) as
      | { west: number; south: number; east: number; north: number }
      | undefined
    if (!rect) return null
    const w = CesiumMath.toDegrees(rect.west)
    const s = CesiumMath.toDegrees(rect.south)
    const e = CesiumMath.toDegrees(rect.east)
    const n = CesiumMath.toDegrees(rect.north)
    return {
      type: 'Polygon',
      coordinates: [
        [
          [w, s, 0],
          [e, s, 0],
          [e, n, 0],
          [w, n, 0],
          [w, s, 0],
        ],
      ],
    }
  }

  // Ellipse / circle — approximate to a 32-vertex polygon.
  if (entity.ellipse && entity.position) {
    const center = entity.position.getValue(NOW)
    const semiMajor = entity.ellipse.semiMajorAxis?.getValue(NOW) as number | undefined
    const semiMinor = entity.ellipse.semiMinorAxis?.getValue(NOW) as number | undefined
    if (!center || !semiMajor || !semiMinor) return null
    const carto = Cartographic.fromCartesian(center)
    const lngC = CesiumMath.toDegrees(carto.longitude)
    const latC = CesiumMath.toDegrees(carto.latitude)
    // Convert axis lengths from meters → degrees (rough — fine for storage).
    const mPerDegLat = 111_320
    const mPerDegLng = 111_320 * Math.cos(carto.latitude)
    const aDeg = semiMajor / mPerDegLng
    const bDeg = semiMinor / mPerDegLat
    const N = 32
    const ring: [number, number, number][] = []
    for (let i = 0; i < N; i++) {
      const t = (i / N) * 2 * Math.PI
      ring.push([lngC + aDeg * Math.cos(t), latC + bDeg * Math.sin(t), carto.height])
    }
    ring.push(ring[0])
    return { type: 'Polygon', coordinates: [ring] }
  }

  return null
}

export function sketchFeatureToGeoJSON(
  feature: SketchFeature,
  viewer: Viewer | null,
): GeoJSONFeature | null {
  if (!viewer) return null
  const entity = viewer.entities.getById(feature.entityId)
  if (!entity) return null
  const geom = entityGeometry(entity)
  if (!geom) return null
  return {
    type: 'Feature',
    id: feature.id,
    geometry: geom,
    properties: {
      ...feature.attributes,
      // Roundtrip metadata so the moderator can see what the user drew.
      _design: {
        geometry_kind: feature.geometry,
        layer_id: feature.layerId,
        label: feature.label,
        style: feature.style,
        elevation: feature.elevationConfig,
        solid: feature.solidParams ?? null,
        created_at: feature.createdAt,
      },
    },
  }
}

export function serializeSketchLayers(
  layers: SketchLayer[],
  features: SketchFeature[],
  viewer: Viewer | null,
): { features: GeoJSONFeature[]; skipped: number } {
  const out: GeoJSONFeature[] = []
  let skipped = 0
  const layerById = new Map(layers.map((l) => [l.id, l]))
  for (const f of features) {
    const layer = layerById.get(f.layerId)
    if (!layer || !layer.visible) continue
    const gj = sketchFeatureToGeoJSON(f, viewer)
    if (gj) out.push(gj)
    else skipped++
  }
  return { features: out, skipped }
}

export type { GeoJSONFeature, GeoJSONGeometry }
