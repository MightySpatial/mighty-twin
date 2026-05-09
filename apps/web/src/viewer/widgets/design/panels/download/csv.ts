/** GeoJSON FeatureCollection → CSV with WKT geometry column. */
import type { GeoJSONFeature } from '../../serializeFeatures'
import { geomToWkt } from './wkt'

export function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function geojsonToCsv(features: GeoJSONFeature[]): string {
  const allKeys = new Set<string>()
  for (const f of features) {
    for (const k of Object.keys(f.properties ?? {})) {
      if (k !== '_design') allKeys.add(k)
    }
  }
  const cols = ['id', 'geometry_wkt', ...allKeys]
  const lines = [cols.join(',')]
  for (const f of features) {
    const props = f.properties ?? {}
    const row = [
      csvCell(f.id),
      csvCell(geomToWkt(f.geometry)),
      ...[...allKeys].map(k => csvCell((props as Record<string, unknown>)[k])),
    ]
    lines.push(row.join(','))
  }
  return lines.join('\n')
}
