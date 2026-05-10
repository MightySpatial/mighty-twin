/** Minimal GeoJSON feature types — what the design widget posts to
 *  /api/design/export and /api/design/submissions.
 *
 *  v1's serialiser walked Cesium entities to extract coordinates; v2
 *  reads positions directly from the engine's nodes (see
 *  DownloadTab.buildFeatureCollection). This file remains as a typed
 *  contract so the helpers in download/* + the tabs share one shape. */

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

export type GeoJSONGeometry = GeoJSONPoint | GeoJSONLineString | GeoJSONPolygon

export interface GeoJSONFeature {
  type: 'Feature'
  id: string
  geometry: GeoJSONGeometry
  properties: Record<string, unknown>
}
