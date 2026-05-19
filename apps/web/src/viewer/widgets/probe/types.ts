/** Probe — NavigableSpace primitive type definitions.
 *
 *  See mockups/PROBE.md for the architecture. Mirrors the DB schema
 *  proposal but lives as plain TypeScript types until the backend
 *  migration ships.
 */

export type NavigableKind = 'path' | 'volume' | 'network'

export interface PathGeometry {
  /** Polyline vertices in [lon, lat, height(m)] tuples. Ordered start→end.
   *  Centerline of the navigable space. */
  vertices: Array<[number, number, number]>
}

export interface VolumeGeometry {
  /** Closed polyhedral surface as triangle indices into a flat vertex array.
   *  vertices: lon/lat/height interleaved. indices: triangle list (3 per face).
   *  For simple v1 we accept axis-aligned bounding boxes as a degenerate case
   *  (just minLon/minLat/minH/maxLon/maxLat/maxH on the kind = 'volume' row). */
  vertices: number[]      // [lon, lat, h, lon, lat, h, …]
  indices: number[]       // triangle list, length % 3 === 0
  /** Fast-path AABB; populated if you don't want to ship a mesh. */
  bbox?: {
    minLon: number; minLat: number; minH: number
    maxLon: number; maxLat: number; maxH: number
  }
}

export interface NavigableSpace {
  id: string
  siteSlug: string

  /** Optional reference to the layer feature this represents (so we can
   *  highlight it on the map and dismiss the linked feature popup). */
  parentFeatureId?: string | null

  kind: NavigableKind

  /** Required when kind='path'. */
  pathGeometry?: PathGeometry
  /** Required when kind='volume'. */
  volumeGeometry?: VolumeGeometry
  /** Required when kind='network'. References the IDs of child spaces. */
  networkChildIds?: string[]

  /** Path cross-section. Default = settings.probe.defaultRadius. */
  crossSectionRadiusM?: number

  /** Optional 3D tileset to load when the user enters this space. */
  interiorTilesetUrl?: string

  /** Optional explicit collision mesh URL (otherwise derived from geometry). */
  collisionMeshUrl?: string

  /** Optional override for damp threshold; defaults from settings. */
  dampThresholdM?: number

  /** Display label — used in HUD / breadcrumbs. */
  name?: string

  /** Audit. */
  createdAt?: string
  updatedAt?: string
}

export interface NavigableConnection {
  id: string
  fromSpaceId: string
  toSpaceId: string
  /** [lon, lat, height(m)] of the junction. */
  junctionPoint: [number, number, number]
  connectionType: 'endpoint' | 'midpoint-branch' | 'portal'
  bidirectional: boolean
}

/** Output of the path constraint solver. */
export interface PathConstraintResult {
  /** Constrained world position (Cartesian3 lon/lat/height). */
  position: [number, number, number]
  /** Constrained velocity (lon/lat/height per second). */
  velocity: [number, number, number]
  /** Centerline parameter t ∈ [0,1] after constraint. */
  t: number
  /** Distance from centerline at the (post-constraint) point. */
  perpDistance: number
  /** Damp fraction 0..1, where 0 = far from wall, 1 = at the wall. */
  dampFraction: number
  /** Forward tangent at t (unit, world space). */
  tangent: [number, number, number]
}
