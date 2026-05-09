/** Export-format catalogue for the Download panel. Mirrors v1's option list:
 *  GeoJSON / Shapefile / KML / DXF / GeoPackage / CSV / IFC plus a Twin-only
 *  "Design state · JSON" round-trip dump.
 *
 *  `clientSide: true` formats can be exported in-browser. Server-side formats
 *  remain in the dropdown for parity with v1, but are tagged with
 *  `requiresExportService: true` and disabled until the v2 backend exposes the
 *  export endpoint. */

export type ExportFormat =
  | 'geojson'
  | 'shapefile'
  | 'kml'
  | 'dxf'
  | 'geopackage'
  | 'csv'
  | 'ifc'
  | 'json_state'

export interface FormatSpec {
  id: ExportFormat
  label: string
  group: 'Client-side' | 'Needs export service'
  clientSide: boolean
}

export const EXPORT_FORMATS: FormatSpec[] = [
  { id: 'geojson',    label: 'GeoJSON',              group: 'Client-side',           clientSide: true  },
  { id: 'csv',        label: 'CSV',                  group: 'Client-side',           clientSide: true  },
  { id: 'json_state', label: 'Design state · JSON',  group: 'Client-side',           clientSide: true  },
  { id: 'shapefile',  label: 'Shapefile',            group: 'Needs export service',  clientSide: false },
  { id: 'kml',        label: 'KML',                  group: 'Needs export service',  clientSide: false },
  { id: 'dxf',        label: 'DXF',                  group: 'Needs export service',  clientSide: false },
  { id: 'geopackage', label: 'GeoPackage',           group: 'Needs export service',  clientSide: false },
  { id: 'ifc',        label: 'IFC (BIM)',            group: 'Needs export service',  clientSide: false },
]

export const FORMAT_BY_ID: Record<ExportFormat, FormatSpec> =
  Object.fromEntries(EXPORT_FORMATS.map(f => [f.id, f])) as Record<ExportFormat, FormatSpec>

/** EPSG options surfaced in the CRS dropdown — mirrors v1 exportCrsOptions. */
export const EXPORT_CRS_OPTIONS: { epsg: number; name: string }[] = [
  { epsg: 4326, name: 'WGS 84 (EPSG:4326)' },
  { epsg: 3857, name: 'Web Mercator (EPSG:3857)' },
  { epsg: 7855, name: 'GDA2020 / MGA Zone 55 (EPSG:7855)' },
  { epsg: 7856, name: 'GDA2020 / MGA Zone 56 (EPSG:7856)' },
]
