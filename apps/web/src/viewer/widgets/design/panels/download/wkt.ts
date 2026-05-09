/** GeoJSON geometry → Well-Known-Text. Used by the CSV exporter so that
 *  consumers can reproject the geometry deterministically without parsing
 *  GeoJSON. */
import type { GeoJSONFeature } from '../../serializeFeatures'

type Coord = readonly [number, number, number?] | number[]

function fmt(c: Coord): string {
  const z = c[2]
  return `${c[0]} ${c[1]}${z != null ? ' ' + z : ''}`
}

export function geomToWkt(g: GeoJSONFeature['geometry']): string {
  switch (g.type) {
    case 'Point':      return `POINT(${fmt(g.coordinates)})`
    case 'LineString': return `LINESTRING(${g.coordinates.map(fmt).join(', ')})`
    case 'Polygon':    return `POLYGON((${g.coordinates[0].map(fmt).join(', ')}))`
    default:           return ''
  }
}
