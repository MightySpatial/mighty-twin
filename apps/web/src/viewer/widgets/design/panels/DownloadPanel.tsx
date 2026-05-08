/** Design Export panel.
 *
 *  Renders into the "Export" rail tab (formerly "Download"). Active
 *  formats:
 *    - GeoJSON · combined (single FeatureCollection)
 *    - GeoJSON · per layer (one file per visible layer)
 *    - CSV (one row per feature with centroid lon/lat/alt + properties)
 *    - Design state · JSON (full round-trip dump)
 *
 *  Stubbed (UI shown, button disabled) until the backend writers land:
 *    - Shapefile, KML, DXF, GeoPackage, IFC
 *  These match the formats v1 supports — see MightyDT/src/components/
 *  design-widget/tabs/DownloadTab.vue.
 *
 *  All active formats use `serializeSketchLayers` from T+420 so Export
 *  and Submit see the same bytes for the GeoJSON-shaped formats.
 */

import { useMemo, useState } from 'react'
import {
  Download,
  Loader,
  Map as MapIcon,
  Code,
  Table,
  Layers,
  Box,
  X,
} from 'lucide-react'
import type { Viewer } from 'cesium'
import type { SketchFeature, SketchLayer } from '../types'
import { serializeSketchLayers, type GeoJSONFeature } from '../serializeFeatures'

interface Props {
  viewer: Viewer | null
  layers: SketchLayer[]
  features: SketchFeature[]
}

type ActiveFormat = 'geojson_combined' | 'geojson_per_layer' | 'csv' | 'json_state'
type StubFormat = 'shapefile' | 'kml' | 'dxf' | 'geopackage' | 'ifc'
type Format = ActiveFormat | StubFormat

const ACTIVE_FORMATS: ActiveFormat[] = [
  'geojson_combined',
  'geojson_per_layer',
  'csv',
  'json_state',
]
const STUB_FORMATS: StubFormat[] = ['shapefile', 'kml', 'dxf', 'geopackage', 'ifc']

interface FormatMeta {
  id: Format
  title: string
  subtitle: string
  icon: React.ReactNode
  active: boolean
}

const FORMAT_META: Record<Format, FormatMeta> = {
  geojson_combined: {
    id: 'geojson_combined',
    title: 'GeoJSON · combined',
    subtitle: 'One FeatureCollection across visible layers',
    icon: <MapIcon size={14} />,
    active: true,
  },
  geojson_per_layer: {
    id: 'geojson_per_layer',
    title: 'GeoJSON · per layer',
    subtitle: 'One file per visible layer (sequential downloads)',
    icon: <Layers size={14} />,
    active: true,
  },
  csv: {
    id: 'csv',
    title: 'CSV',
    subtitle: 'Centroid lon/lat/alt + feature properties',
    icon: <Table size={14} />,
    active: true,
  },
  json_state: {
    id: 'json_state',
    title: 'Design state · JSON',
    subtitle: 'Full sketch state for round-trip into another Twin',
    icon: <Code size={14} />,
    active: true,
  },
  shapefile: {
    id: 'shapefile',
    title: 'Shapefile',
    subtitle: 'ESRI .shp + .dbf + .prj bundle',
    icon: <Layers size={14} />,
    active: false,
  },
  kml: {
    id: 'kml',
    title: 'KML',
    subtitle: 'Google Earth / OGC KML',
    icon: <MapIcon size={14} />,
    active: false,
  },
  dxf: {
    id: 'dxf',
    title: 'DXF',
    subtitle: 'AutoCAD drawing exchange',
    icon: <Box size={14} />,
    active: false,
  },
  geopackage: {
    id: 'geopackage',
    title: 'GeoPackage',
    subtitle: 'OGC GeoPackage SQLite container',
    icon: <Layers size={14} />,
    active: false,
  },
  ifc: {
    id: 'ifc',
    title: 'IFC (BIM)',
    subtitle: 'Industry Foundation Classes — buildingSMART',
    icon: <Box size={14} />,
    active: false,
  },
}

export default function DownloadPanel({ viewer, layers, features }: Props) {
  const [format, setFormat] = useState<ActiveFormat>('geojson_combined')
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const summary = useMemo(() => {
    const visibleLayers = layers.filter((l) => l.visible)
    const visibleIds = new Set(visibleLayers.map((l) => l.id))
    const featureCount = features.filter((f) => visibleIds.has(f.layerId)).length
    return {
      visibleLayers,
      featureCount,
      totalLayers: layers.length,
      totalFeatures: features.length,
    }
  }, [layers, features])

  function trigger(filename: string, content: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      if (format === 'geojson_combined') {
        const { features: gjFeatures, skipped } = serializeSketchLayers(
          layers,
          features,
          viewer,
        )
        if (gjFeatures.length === 0) {
          throw new Error(
            skipped > 0
              ? `${skipped} feature(s) couldn't be serialised — usually means the entity has no realised geometry yet.`
              : 'No features to download.',
          )
        }
        trigger(
          `mighty-twin-design-${stamp}.geojson`,
          JSON.stringify({ type: 'FeatureCollection', features: gjFeatures }, null, 2),
          'application/geo+json',
        )
      } else if (format === 'geojson_per_layer') {
        const visibleLayers = layers.filter((l) => l.visible)
        if (visibleLayers.length === 0) {
          throw new Error('No visible layers to download.')
        }
        let writtenAny = false
        for (const layer of visibleLayers) {
          const layerFeatures = features.filter((f) => f.layerId === layer.id)
          if (layerFeatures.length === 0) continue
          const { features: gjFeatures } = serializeSketchLayers(
            [layer],
            layerFeatures,
            viewer,
          )
          if (gjFeatures.length === 0) continue
          trigger(
            `${slugify(layer.name)}-${stamp}.geojson`,
            JSON.stringify({ type: 'FeatureCollection', features: gjFeatures }, null, 2),
            'application/geo+json',
          )
          writtenAny = true
        }
        if (!writtenAny) {
          throw new Error('No serialisable features in any visible layer.')
        }
      } else if (format === 'csv') {
        const { features: gjFeatures, skipped } = serializeSketchLayers(
          layers,
          features,
          viewer,
        )
        if (gjFeatures.length === 0) {
          throw new Error(
            skipped > 0
              ? `${skipped} feature(s) couldn't be serialised — usually means the entity has no realised geometry yet.`
              : 'No features to download.',
          )
        }
        trigger(
          `mighty-twin-design-${stamp}.csv`,
          featuresToCsv(gjFeatures),
          'text/csv',
        )
      } else {
        // json_state — full state dump for round-trip
        const payload = {
          schema: 1,
          exported_at: new Date().toISOString(),
          layers,
          features,
        }
        trigger(
          `mighty-twin-design-state-${stamp}.json`,
          JSON.stringify(payload, null, 2),
          'application/json',
        )
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="export-panel">
      <div className="export-summary">
        <span className="export-summary-icon">
          <Download size={16} />
        </span>
        <div style={{ flex: 1 }}>
          <div className="export-summary-title">
            {summary.featureCount} feature{summary.featureCount === 1 ? '' : 's'} ready
          </div>
          <div className="export-summary-sub">
            From {summary.visibleLayers.length} visible / {summary.totalLayers} total
            layer{summary.totalLayers === 1 ? '' : 's'}
          </div>
        </div>
      </div>

      <div className="export-formats">
        {ACTIVE_FORMATS.map((id) => {
          const meta = FORMAT_META[id]
          return (
            <button
              key={id}
              className={`export-format-row${format === id ? ' active' : ''}`}
              onClick={() => setFormat(id)}
            >
              <span className="export-format-icon">{meta.icon}</span>
              <span className="export-format-text">
                <div className="export-format-title">{meta.title}</div>
                <div className="export-format-sub">{meta.subtitle}</div>
              </span>
            </button>
          )
        })}
      </div>

      <div>
        <div className="draw-section-label">Coming soon</div>
        <div className="export-formats">
          {STUB_FORMATS.map((id) => {
            const meta = FORMAT_META[id]
            return (
              <button
                key={id}
                className="export-format-row"
                disabled
                title="Backend writer not yet wired — coming soon"
              >
                <span className="export-format-icon">{meta.icon}</span>
                <span className="export-format-text">
                  <div className="export-format-title">{meta.title}</div>
                  <div className="export-format-sub">{meta.subtitle}</div>
                </span>
                <span className="export-soon-tag">Soon</span>
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <div className="export-error">
          <X size={12} /> {error}
        </div>
      )}

      <button
        className="export-download-btn"
        onClick={download}
        disabled={downloading || summary.featureCount === 0}
      >
        {downloading ? (
          <>
            <Loader size={14} className="spin" /> Preparing…
          </>
        ) : (
          <>
            <Download size={14} /> Download
          </>
        )}
      </button>
    </div>
  )
}

function slugify(s: string): string {
  return (s || 'sketch').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'sketch'
}

/** Convert a GeoJSON FeatureCollection-style array to CSV.
 *  Each row has lon/lat/alt of the geometry centroid plus a stable
 *  set of property columns derived from the union of every feature's
 *  properties (excluding the nested `_design` metadata bag, which we
 *  keep in a single JSON-stringified column for round-trip). */
function featuresToCsv(gjFeatures: GeoJSONFeature[]): string {
  // Collect property keys (skip the nested _design bag)
  const keys = new Set<string>()
  for (const f of gjFeatures) {
    for (const k of Object.keys(f.properties)) {
      if (k !== '_design') keys.add(k)
    }
  }
  const propColumns = Array.from(keys).sort()
  const header = ['feature_id', 'lon', 'lat', 'alt', ...propColumns, '_design']
  const rows: string[] = [header.map(csvCell).join(',')]
  for (const f of gjFeatures) {
    const [lon, lat, alt] = centroid(f)
    const row: string[] = [
      String(f.id ?? ''),
      lon == null ? '' : lon.toFixed(7),
      lat == null ? '' : lat.toFixed(7),
      alt == null ? '' : alt.toFixed(3),
    ]
    for (const k of propColumns) {
      row.push(stringifyCell(f.properties[k]))
    }
    row.push(JSON.stringify(f.properties._design ?? null))
    rows.push(row.map(csvCell).join(','))
  }
  return rows.join('\n')
}

function centroid(f: GeoJSONFeature): [number | null, number | null, number | null] {
  const g = f.geometry
  if (g.type === 'Point') {
    const [x, y, z] = g.coordinates
    return [x, y, z ?? null]
  }
  if (g.type === 'LineString') {
    return averageCoords(g.coordinates)
  }
  if (g.type === 'Polygon') {
    // Use first ring (outer) for centroid
    return averageCoords(g.coordinates[0] ?? [])
  }
  return [null, null, null]
}

function averageCoords(
  coords: [number, number, number?][],
): [number | null, number | null, number | null] {
  if (coords.length === 0) return [null, null, null]
  let sx = 0
  let sy = 0
  let sz = 0
  let zCount = 0
  for (const [x, y, z] of coords) {
    sx += x
    sy += y
    if (z != null) {
      sz += z
      zCount++
    }
  }
  return [
    sx / coords.length,
    sy / coords.length,
    zCount > 0 ? sz / zCount : null,
  ]
}

function stringifyCell(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** RFC 4180-ish escaping: quote anything containing comma, quote, or newline. */
function csvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
