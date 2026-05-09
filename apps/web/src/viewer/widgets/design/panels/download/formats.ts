/** Export-format catalogue for the Download panel.
 *
 *  Every format below is wired through to the v2 backend
 *  (`/api/design/export`) — see `apps/api/src/twin_api/design_export_routes.py`.
 *  No server-required gating: the client posts the GeoJSON payload and the
 *  server returns a downloadable blob for Shapefile/KML/GeoPackage/DXF.
 *  GeoJSON, CSV (WKT), and `json_state` (Twin round-trip) run client-side
 *  when CRS is 4326; non-4326 reprojection routes through the same server
 *  endpoint.
 *
 *  IFC is intentionally absent — v1's `design_export` did not implement it
 *  either; the v2 widget surface omits it for parity. */

export type ExportFormat =
  | 'geojson'
  | 'csv'
  | 'json_state'
  | 'shapefile'
  | 'kml'
  | 'geopackage'
  | 'dxf'

export interface FormatSpec {
  id: ExportFormat
  label: string
  group: 'Vector' | 'CAD / BIM' | 'Twin internal'
}

export const EXPORT_FORMATS: FormatSpec[] = [
  { id: 'geojson',    label: 'GeoJSON',              group: 'Vector'        },
  { id: 'shapefile',  label: 'Shapefile',            group: 'Vector'        },
  { id: 'kml',        label: 'KML',                  group: 'Vector'        },
  { id: 'geopackage', label: 'GeoPackage',           group: 'Vector'        },
  { id: 'csv',        label: 'CSV (WKT)',            group: 'Vector'        },
  { id: 'dxf',        label: 'DXF',                  group: 'CAD / BIM'     },
  { id: 'json_state', label: 'Design state · JSON',  group: 'Twin internal' },
]

export const FORMAT_BY_ID: Record<ExportFormat, FormatSpec> =
  Object.fromEntries(EXPORT_FORMATS.map(f => [f.id, f])) as Record<ExportFormat, FormatSpec>
